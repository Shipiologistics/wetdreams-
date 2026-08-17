alter table public.messages
add column if not exists delivered_at timestamptz;

update public.messages
set delivered_at = read_at
where read_at is not null
  and delivered_at is null;

create index if not exists messages_room_sender_delivery_idx
on public.messages (room_id, sender_id, delivered_at, read_at);

create or replace function public.mark_room_delivered(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.chat_rooms where id = p_room_id and v_user in (user_a, user_b)) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.messages
  set delivered_at = now()
  where room_id = p_room_id
    and sender_id <> v_user
    and delivered_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_room_read(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.chat_rooms where id = p_room_id and v_user in (user_a, user_b)) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.messages
  set delivered_at = coalesce(delivered_at, now()),
      read_at = now()
  where room_id = p_room_id
    and sender_id <> v_user
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_room_delivered(uuid) from public;
revoke all on function public.mark_room_read(uuid) from public;
grant execute on function public.mark_room_delivered(uuid) to authenticated;
grant execute on function public.mark_room_read(uuid) to authenticated;
