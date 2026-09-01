alter table public.reports
  add column if not exists related_rating_id uuid references public.ratings(id);

create index if not exists reports_related_rating_idx
  on public.reports (related_rating_id)
  where related_rating_id is not null;

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
  where c.status = 'ended'
    and c.duration_seconds > 0
    and (
      (c.caller_id = v_rater and c.receiver_id = p_rated_user)
      or (c.caller_id = p_rated_user and c.receiver_id = v_rater)
    )
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

create or replace function public.report_host_review(
  p_rating_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := (select auth.uid());
  v_rating public.ratings;
  v_report uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_host is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'INVALID_REPORT' using errcode = 'P0001';
  end if;

  select * into v_rating
  from public.ratings
  where id = p_rating_id
  for update;

  if v_rating.id is null then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_rating.rated_user_id <> v_host then
    raise exception 'REVIEW_REPORT_NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.reports (
    reporter_id,
    reported_user_id,
    room_id,
    related_rating_id,
    reason
  )
  values (
    v_host,
    v_rating.rater_id,
    v_rating.room_id,
    v_rating.id,
    left('Review report: ' || v_reason, 1000)
  )
  returning id into v_report;

  return v_report;
end;
$$;

revoke all on function public.report_host_review(uuid, text) from public, anon, authenticated;
grant execute on function public.report_host_review(uuid, text) to authenticated;
