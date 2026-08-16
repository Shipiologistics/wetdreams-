create table if not exists public.user_devices (
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (device_hash, user_id)
);

create table if not exists public.device_bans (
  device_hash text primary key check (device_hash ~ '^[a-f0-9]{64}$'),
  banned_at timestamptz not null default now(),
  reason text not null default 'block_threshold',
  blocked_user_id uuid references public.users(id) on delete set null,
  block_count integer not null default 0 check (block_count >= 0)
);

create table if not exists public.block_events (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  blocked_device_hash text,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id)
);

create index if not exists user_devices_user_recent_idx on public.user_devices (user_id, last_seen_at desc);
create index if not exists block_events_blocked_recent_idx on public.block_events (blocked_id, created_at desc);
create index if not exists block_events_blocker_recent_idx on public.block_events (blocker_id, created_at desc);

alter table public.user_devices enable row level security;
alter table public.device_bans enable row level security;
alter table public.block_events enable row level security;

create policy user_devices_read_own on public.user_devices for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

create policy device_bans_admin_read on public.device_bans for select to authenticated
using (public.is_admin());

create policy block_events_admin_read on public.block_events for select to authenticated
using (public.is_admin());

create or replace function public.hash_device_id(p_device_id text)
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when p_device_id is null or char_length(p_device_id) < 16 or char_length(p_device_id) > 200 then null
    else encode(extensions.digest(p_device_id, 'sha256'), 'hex')
  end;
$$;

create or replace function public.is_device_banned(p_device_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.device_bans
    where device_hash = public.hash_device_id(p_device_id)
  );
$$;

create or replace function public.register_device(p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_device_hash text := public.hash_device_id(p_device_id);
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if v_device_hash is null then raise exception 'INVALID_DEVICE' using errcode = 'P0001'; end if;

  if exists (select 1 from public.device_bans where device_hash = v_device_hash) then
    update public.users set is_banned = true where id = v_user;
    raise exception 'DEVICE_BANNED' using errcode = 'P0001';
  end if;

  insert into public.user_devices (device_hash, user_id)
  values (v_device_hash, v_user)
  on conflict (device_hash, user_id) do update
  set last_seen_at = now();

  return true;
end;
$$;

create or replace function public.block_user(p_blocked_user uuid, p_device_id text default null)
returns public.blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocker uuid := (select auth.uid());
  v_block public.blocks;
  v_device_hash text := public.hash_device_id(p_device_id);
  v_blocked_device_hash text;
  v_block_count integer := 0;
begin
  if v_blocker is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_blocked_user is null or p_blocked_user = v_blocker then raise exception 'INVALID_TARGET' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_blocker and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if v_device_hash is not null then perform public.register_device(p_device_id); end if;
  if exists (select 1 from public.device_bans db join public.user_devices ud on ud.device_hash = db.device_hash where ud.user_id = v_blocker) then
    update public.users set is_banned = true where id = v_blocker;
    raise exception 'DEVICE_BANNED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.chat_rooms
    where v_blocker in (user_a, user_b) and p_blocked_user in (user_a, user_b)
  ) then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_blocker, p_blocked_user)
  on conflict (blocker_id, blocked_id) do nothing
  returning * into v_block;

  if v_block.blocker_id is null then
    select * into v_block from public.blocks where blocker_id = v_blocker and blocked_id = p_blocked_user;
    return v_block;
  end if;

  select device_hash into v_blocked_device_hash
  from public.user_devices
  where user_id = p_blocked_user
  order by last_seen_at desc
  limit 1;

  insert into public.block_events (blocker_id, blocked_id, blocked_device_hash)
  values (v_blocker, p_blocked_user, v_blocked_device_hash);

  select count(distinct blocker_id) into v_block_count
  from public.block_events
  where blocked_id = p_blocked_user
    and created_at >= now() - interval '7 days';

  if v_block_count >= 5 then
    update public.users set is_banned = true where id = p_blocked_user;
    insert into public.device_bans (device_hash, blocked_user_id, block_count)
    select device_hash, p_blocked_user, v_block_count
    from public.user_devices
    where user_id = p_blocked_user
    on conflict (device_hash) do update
    set banned_at = now(),
        blocked_user_id = excluded.blocked_user_id,
        block_count = greatest(public.device_bans.block_count, excluded.block_count);
  end if;

  return v_block;
end;
$$;

create or replace function public.unblock_user(p_blocked_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocker uuid := (select auth.uid());
begin
  if v_blocker is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_blocked_user is null or p_blocked_user = v_blocker then raise exception 'INVALID_TARGET' using errcode = 'P0001'; end if;
  delete from public.blocks where blocker_id = v_blocker and blocked_id = p_blocked_user;
end;
$$;

create or replace function public.get_room_block_state(p_room_id uuid)
returns table(viewer_blocked_other boolean, other_blocked_viewer boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_other uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;

  select case when user_a = v_user then user_b else user_a end into v_other
  from public.chat_rooms
  where id = p_room_id and v_user in (user_a, user_b);

  if v_other is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;

  return query
  select
    exists (select 1 from public.blocks where blocker_id = v_user and blocked_id = v_other),
    exists (select 1 from public.blocks where blocker_id = v_other and blocked_id = v_user);
end;
$$;

create or replace function public.start_call(p_room_id uuid, p_call_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_receiver uuid;
  v_rate numeric(12, 2);
  v_balance numeric(14, 2);
  v_id uuid := gen_random_uuid();
begin
  if v_caller is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_call_type not in ('audio', 'video') then raise exception 'INVALID_CALL_TYPE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_caller and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;

  select case when user_a = v_caller then user_b else user_a end into v_receiver
  from public.chat_rooms where id = p_room_id and v_caller in (user_a, user_b) and status = 'active';
  if v_receiver is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_caller, v_receiver), (v_receiver, v_caller))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_receiver and is_banned) then raise exception 'USER_UNAVAILABLE' using errcode = 'P0001'; end if;

  select case when p_call_type = 'audio' then audio_call_rate_coins else video_call_rate_coins end
  into v_rate from public.profiles where user_id = v_receiver;
  select coins_balance into v_balance from public.wallets where user_id = v_caller;
  if v_balance < v_rate then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;
  insert into public.calls (id, room_id, caller_id, receiver_id, call_type, agora_channel_name, rate_per_minute)
  values (v_id, p_room_id, v_caller, v_receiver, p_call_type, 'call_' || replace(v_id::text, '-', ''), v_rate);
  if exists (select 1 from public.users where id = v_receiver and role = 'bot') then
    perform public.charge_call_minute(v_id);
  end if;
  return v_id;
end;
$$;

revoke insert, delete on public.blocks from authenticated;
revoke all on public.user_devices, public.device_bans, public.block_events from anon, authenticated;
grant select on public.user_devices, public.device_bans, public.block_events to authenticated;
revoke all on function public.hash_device_id(text) from public, anon, authenticated;
revoke all on function public.register_device(text) from public, anon, authenticated;
revoke all on function public.is_device_banned(text) from public, anon, authenticated;
revoke all on function public.block_user(uuid, text) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.get_room_block_state(uuid) from public, anon, authenticated;
grant execute on function public.register_device(text) to authenticated;
grant execute on function public.is_device_banned(text) to anon, authenticated;
grant execute on function public.block_user(uuid, text) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_room_block_state(uuid) to authenticated;
