alter table public.calls
  alter column billed_minutes type numeric(12, 4)
  using billed_minutes::numeric;

alter table public.visitor_sessions
  add column if not exists presence text not null default 'online'
  check (presence in ('online', 'offline'));

create index if not exists calls_active_participants_idx
  on public.calls (status, caller_id, receiver_id)
  where status in ('ringing', 'ongoing');

create index if not exists visitor_sessions_online_recent_idx
  on public.visitor_sessions (user_id, last_seen_at desc)
  where presence = 'online';

create or replace function public.resolve_user_presence(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.calls c
      where c.status = 'ongoing'
        and p_user_id in (c.caller_id, c.receiver_id)
    ) then 'in_call'
    when exists (
      select 1
      from public.calls c
      where c.status = 'ringing'
        and p_user_id in (c.caller_id, c.receiver_id)
    ) then 'busy'
    when exists (
      select 1
      from public.visitor_sessions v
      where v.user_id = p_user_id
        and v.presence = 'online'
        and v.last_seen_at >= now() - interval '10 minutes'
    ) then 'online'
    else 'offline'
  end;
$$;

create or replace function public.refresh_user_presence(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_user_id is null then return 'offline'; end if;

  select public.resolve_user_presence(p_user_id) into v_status;

  update public.users
  set status = v_status,
      updated_at = now()
  where id = p_user_id
    and status is distinct from v_status;

  return v_status;
end;
$$;

create or replace function public.refresh_stale_presence()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  update public.users u
  set status = 'offline',
      updated_at = now()
  where u.status = 'online'
    and not exists (
      select 1
      from public.visitor_sessions v
      where v.user_id = u.id
        and v.presence = 'online'
        and v.last_seen_at >= now() - interval '10 minutes'
    )
    and not exists (
      select 1
      from public.calls c
      where c.status in ('ringing', 'ongoing')
        and u.id in (c.caller_id, c.receiver_id)
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

drop function if exists public.track_visitor_session(text, text, text, text);

create or replace function public.track_visitor_session(
  p_session_id text,
  p_device_id text default null,
  p_path text default '/',
  p_user_agent text default null,
  p_presence text default 'online'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_device_hash text := public.hash_device_id(p_device_id);
  v_path text := left(coalesce(nullif(btrim(p_path), ''), '/'), 250);
  v_user_agent text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 500);
  v_presence text := coalesce(nullif(btrim(p_presence), ''), 'online');
begin
  if p_session_id is null or char_length(p_session_id) < 16 or char_length(p_session_id) > 120 then
    raise exception 'INVALID_VISITOR_SESSION' using errcode = 'P0001';
  end if;
  if v_presence not in ('online', 'offline') then
    raise exception 'INVALID_PRESENCE' using errcode = 'P0001';
  end if;

  perform public.refresh_stale_presence();

  insert into public.visitor_sessions (session_id, user_id, device_hash, path, user_agent, presence)
  values (p_session_id, v_user, v_device_hash, v_path, v_user_agent, v_presence)
  on conflict (session_id) do update
  set user_id = coalesce(excluded.user_id, public.visitor_sessions.user_id),
      device_hash = coalesce(excluded.device_hash, public.visitor_sessions.device_hash),
      path = excluded.path,
      user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
      presence = v_presence,
      last_seen_at = case when v_presence = 'online' then now() else public.visitor_sessions.last_seen_at end;

  if v_user is not null then
    if v_presence = 'online' then
      update public.users
      set last_seen = now(),
          status = public.resolve_user_presence(v_user),
          updated_at = now()
      where id = v_user;
    elsif not exists (
      select 1
      from public.calls c
      where c.status in ('ringing', 'ongoing')
        and v_user in (c.caller_id, c.receiver_id)
    ) then
      update public.users
      set status = public.resolve_user_presence(v_user),
          updated_at = now()
      where id = v_user;
    end if;
  end if;

  return true;
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

  perform public.refresh_stale_presence();

  select case when user_a = v_caller then user_b else user_a end into v_receiver
  from public.chat_rooms where id = p_room_id and v_caller in (user_a, user_b) and status = 'active';
  if v_receiver is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_caller, v_receiver), (v_receiver, v_caller))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_receiver and is_banned) then raise exception 'USER_UNAVAILABLE' using errcode = 'P0001'; end if;
  if exists (
    select 1
    from public.calls
    where status in ('ringing', 'ongoing')
      and (v_caller in (caller_id, receiver_id) or v_receiver in (caller_id, receiver_id))
  ) then raise exception 'USER_BUSY' using errcode = 'P0001'; end if;

  select case when p_call_type = 'audio' then audio_call_rate_coins else video_call_rate_coins end
  into v_rate from public.profiles where user_id = v_receiver;
  select coins_balance into v_balance from public.wallets where user_id = v_caller for update;
  if v_balance < round(v_rate / 60, 2) then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;

  insert into public.calls (id, room_id, caller_id, receiver_id, call_type, agora_channel_name, rate_per_minute)
  values (v_id, p_room_id, v_caller, v_receiver, p_call_type, 'call_' || replace(v_id::text, '-', ''), v_rate);

  update public.users
  set status = 'busy',
      last_seen = case when id = v_caller then now() else last_seen end,
      updated_at = now()
  where id in (v_caller, v_receiver);

  if exists (select 1 from public.users where id = v_receiver and role = 'bot') then
    update public.calls set status = 'ongoing', started_at = now() where id = v_id;
    update public.users set status = 'in_call', updated_at = now() where id in (v_caller, v_receiver);
  end if;

  return v_id;
end;
$$;

create or replace function public.charge_call_minute(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_call public.calls;
begin
  select * into v_call from public.calls where id = p_call_id for update;
  if v_call.id is null or v_user not in (v_call.caller_id, v_call.receiver_id) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_call.status not in ('ringing', 'ongoing') then return false; end if;

  update public.calls
  set status = 'ongoing',
      started_at = coalesce(started_at, now())
  where id = p_call_id;

  update public.users
  set status = 'in_call',
      last_seen = case when id = v_user then now() else last_seen end,
      updated_at = now()
  where id in (v_call.caller_id, v_call.receiver_id);

  return true;
end;
$$;

create or replace function public.respond_to_call(p_call_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.calls;
begin
  select * into v_call from public.calls where id = p_call_id and status = 'ringing' for update;
  if v_call.id is null or v_call.receiver_id <> (select auth.uid()) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.calls set status = 'rejected', ended_at = now() where id = p_call_id;
    perform public.refresh_user_presence(v_call.caller_id);
    perform public.refresh_user_presence(v_call.receiver_id);
    return false;
  end if;

  return public.charge_call_minute(p_call_id);
end;
$$;

create or replace function public.end_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.calls;
  v_duration_seconds integer;
  v_billable_minutes numeric(12, 4);
  v_charge numeric(14, 2);
  v_credit numeric(14, 2);
  v_sender_balance numeric(14, 2);
  v_receiver_balance numeric(14, 2);
  v_ratio numeric := 0.8;
begin
  select * into v_call
  from public.calls
  where id = p_call_id
    and (select auth.uid()) in (caller_id, receiver_id)
    and status in ('ringing', 'ongoing')
  for update;

  if v_call.id is null then return; end if;

  if v_call.status = 'ringing' then
    update public.calls set status = 'ended', ended_at = now() where id = p_call_id;
    perform public.refresh_user_presence(v_call.caller_id);
    perform public.refresh_user_presence(v_call.receiver_id);
    return;
  end if;

  v_duration_seconds := greatest(0, coalesce(extract(epoch from now() - v_call.started_at)::integer, 0));
  v_billable_minutes := round(v_duration_seconds::numeric / 60, 4);
  v_charge := round(v_call.rate_per_minute * v_billable_minutes, 2);

  perform 1 from public.wallets where user_id in (v_call.caller_id, v_call.receiver_id) order by user_id for update;
  select coins_balance into v_sender_balance from public.wallets where user_id = v_call.caller_id;
  v_charge := least(v_charge, v_sender_balance);
  select coalesce((value #>> '{}')::numeric, 0.8) into v_ratio from public.platform_config where key = 'bean_payout_ratio';
  v_credit := round(v_charge * v_ratio, 2);

  if v_charge > 0 then
    update public.wallets
    set coins_balance = coins_balance - v_charge
    where user_id = v_call.caller_id
    returning coins_balance into v_sender_balance;

    update public.wallets
    set beans_balance = beans_balance + v_credit,
        lifetime_beans_earned = lifetime_beans_earned + v_credit
    where user_id = v_call.receiver_id
    returning beans_balance into v_receiver_balance;

    insert into public.wallet_transactions
      (user_id, type, currency, amount, balance_after, related_call_id, idempotency_key)
    values
      (v_call.caller_id, 'call_spend', 'coin', -v_charge, v_sender_balance, p_call_id, 'call:' || p_call_id || ':seconds:spend'),
      (v_call.receiver_id, 'bean_credit', 'bean', v_credit, v_receiver_balance, p_call_id, 'call:' || p_call_id || ':seconds:earn')
    on conflict (idempotency_key) do nothing;
  end if;

  update public.calls
  set status = 'ended',
      ended_at = now(),
      duration_seconds = v_duration_seconds,
      billed_minutes = v_billable_minutes,
      coins_charged = v_charge
  where id = p_call_id;

  perform public.refresh_user_presence(v_call.caller_id);
  perform public.refresh_user_presence(v_call.receiver_id);
end;
$$;

revoke all on function public.resolve_user_presence(uuid) from public, anon, authenticated;
revoke all on function public.refresh_user_presence(uuid) from public, anon, authenticated;
revoke all on function public.refresh_stale_presence() from public, anon, authenticated;
revoke all on function public.track_visitor_session(text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.track_visitor_session(text, text, text, text, text) to anon, authenticated;
