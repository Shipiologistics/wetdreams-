drop function if exists public.match_random_chat();

create or replace function public.match_random_chat(p_reset boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_partner uuid;
  v_room uuid;
  v_existing public.random_chat_queue;
  v_previous_room uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_user and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;

  if p_reset then
    select matched_room_id into v_previous_room
    from public.random_chat_queue
    where user_id = v_user and status = 'matched';

    if v_previous_room is not null then
      update public.calls
      set status = case when status = 'ringing' then 'missed' else 'ended' end,
          ended_at = coalesce(ended_at, now())
      where room_id = v_previous_room and status in ('ringing', 'ongoing');

      update public.chat_rooms
      set status = 'closed', last_message_at = now()
      where id = v_previous_room and room_type = 'random' and status = 'active';

      update public.random_chat_queue
      set status = 'cancelled', matched_room_id = null
      where matched_room_id = v_previous_room;
    end if;
  else
    select * into v_existing from public.random_chat_queue where user_id = v_user;
    if v_existing.status = 'matched' and v_existing.matched_room_id is not null then
      return v_existing.matched_room_id;
    end if;
  end if;

  insert into public.random_chat_queue (user_id, status, matched_room_id, joined_at)
  values (v_user, 'waiting', null, now())
  on conflict (user_id) do update
  set status = 'waiting', matched_room_id = null, joined_at = now();

  select q.user_id into v_partner
  from public.random_chat_queue q
  join public.users u on u.id = q.user_id
  where q.status = 'waiting' and q.user_id <> v_user and not u.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id, b.blocked_id) in ((v_user, q.user_id), (q.user_id, v_user))
    )
  order by q.joined_at
  for update of q skip locked
  limit 1;

  if v_partner is null then return null; end if;

  insert into public.chat_rooms (user_a, user_b, room_type)
  values (least(v_user, v_partner), greatest(v_user, v_partner), 'random')
  returning id into v_room;

  update public.random_chat_queue
  set status = 'matched', matched_room_id = v_room
  where user_id in (v_user, v_partner) and status = 'waiting';

  if (select count(*) from public.random_chat_queue where matched_room_id = v_room) <> 2 then
    raise exception 'MATCH_RETRY' using errcode = '40001';
  end if;
  return v_room;
end;
$$;

create or replace function public.disconnect_random_chat(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_room public.chat_rooms;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;

  select * into v_room
  from public.chat_rooms
  where id = p_room_id
  for update;

  if v_room.id is null or v_user not in (v_room.user_a, v_room.user_b) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_room.room_type <> 'random' then
    raise exception 'NOT_RANDOM_ROOM' using errcode = 'P0001';
  end if;

  update public.calls
  set status = case when status = 'ringing' then 'missed' else 'ended' end,
      ended_at = coalesce(ended_at, now())
  where room_id = p_room_id and status in ('ringing', 'ongoing');

  update public.chat_rooms
  set status = 'closed', last_message_at = now()
  where id = p_room_id and status = 'active';

  update public.random_chat_queue
  set status = 'cancelled', matched_room_id = null
  where matched_room_id = p_room_id
     or user_id in (v_room.user_a, v_room.user_b);
end;
$$;

grant execute on function public.match_random_chat(boolean) to authenticated;
grant execute on function public.disconnect_random_chat(uuid) to authenticated;
