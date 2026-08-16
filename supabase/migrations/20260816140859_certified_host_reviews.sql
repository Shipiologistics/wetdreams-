create unique index if not exists ratings_one_review_per_host_idx
  on public.ratings (rater_id, rated_user_id);

drop policy if exists ratings_insert_participant on public.ratings;
revoke insert on public.ratings from authenticated;

create or replace function public.submit_host_review(
  p_rated_user uuid,
  p_score integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rater uuid := (select auth.uid());
  v_room uuid;
  v_review uuid;
  v_comment text := left(nullif(btrim(coalesce(p_comment, '')), ''), 1000);
begin
  if v_rater is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_score < 1 or p_score > 5 then
    raise exception 'INVALID_RATING' using errcode = 'P0001';
  end if;
  if p_rated_user = v_rater then
    raise exception 'INVALID_RATING' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.users u
    where u.id = p_rated_user
      and u.role = 'user'
      and u.is_guest = false
      and u.is_banned = false
  ) then
    raise exception 'USER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select c.room_id into v_room
  from public.calls c
  where c.caller_id = v_rater
    and c.receiver_id = p_rated_user
    and c.status = 'ended'
    and c.duration_seconds > 0
  order by c.ended_at desc nulls last, c.created_at desc
  limit 1;

  if v_room is null then
    raise exception 'CERTIFIED_CALL_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.ratings (rater_id, rated_user_id, room_id, score, comment)
  values (v_rater, p_rated_user, v_room, p_score, v_comment)
  on conflict (rater_id, rated_user_id) do update
  set score = excluded.score,
      comment = excluded.comment,
      room_id = excluded.room_id,
      created_at = now()
  returning id into v_review;

  return v_review;
end;
$$;

revoke all on function public.submit_host_review(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.submit_host_review(uuid, integer, text) to authenticated;
