revoke all on function public.submit_host_request(text, text) from public, anon, authenticated;
revoke all on function public.admin_review_host_request(uuid, boolean, text) from public, anon, authenticated;
revoke all on public.host_requests from anon, authenticated;

create or replace function public.start_call(p_room_id uuid, p_call_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_receiver uuid;
  v_receiver_is_host boolean := false;
  v_rate numeric(12, 2) := 0;
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

  select is_verified and role = 'user' and not is_guest and not is_banned
  into v_receiver_is_host
  from public.users
  where id = v_receiver;

  if coalesce(v_receiver_is_host, false) then
    select case when p_call_type = 'audio' then audio_call_rate_coins else video_call_rate_coins end
    into v_rate from public.profiles where user_id = v_receiver;
  end if;

  select coins_balance into v_balance from public.wallets where user_id = v_caller for update;
  if coalesce(v_balance, 0) < round(coalesce(v_rate, 0) / 60, 2) then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.calls (id, room_id, caller_id, receiver_id, call_type, agora_channel_name, rate_per_minute)
  values (v_id, p_room_id, v_caller, v_receiver, p_call_type, 'call_' || replace(v_id::text, '-', ''), coalesce(v_rate, 0));

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

create or replace function public.end_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.calls;
  v_receiver_is_host boolean := false;
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

  select is_verified and role = 'user' and not is_guest and not is_banned
  into v_receiver_is_host
  from public.users
  where id = v_call.receiver_id;

  v_duration_seconds := greatest(0, coalesce(extract(epoch from now() - v_call.started_at)::integer, 0));
  v_billable_minutes := round(v_duration_seconds::numeric / 60, 4);
  v_charge := case
    when coalesce(v_receiver_is_host, false) then round(v_call.rate_per_minute * v_billable_minutes, 2)
    else 0
  end;

  perform 1 from public.wallets where user_id in (v_call.caller_id, v_call.receiver_id) order by user_id for update;
  select coins_balance into v_sender_balance from public.wallets where user_id = v_call.caller_id;
  v_charge := least(v_charge, coalesce(v_sender_balance, 0));
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

create or replace function public.send_message(
  p_room_id uuid,
  p_message_type text,
  p_content text default null,
  p_cloudinary_url text default null,
  p_cloudinary_public_id text default null,
  p_cloudinary_resource_type text default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_receiver uuid;
  v_receiver_is_host boolean := false;
  v_room public.chat_rooms;
  v_message public.messages;
  v_rate numeric(12, 2) := 0;
  v_sender_balance numeric(14, 2);
  v_receiver_balance numeric(14, 2);
  v_ratio numeric := 0.8;
  v_bean_credit numeric(14, 2) := 0;
  v_free boolean := false;
  v_paid boolean := false;
  v_free_limit integer := 10;
  v_message_id uuid := gen_random_uuid();
  v_active_paid_minute boolean := false;
  v_sender_gender text;
begin
  if v_sender is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_message_type not in ('text', 'image', 'video', 'emoji') then raise exception 'INVALID_MESSAGE_TYPE' using errcode = 'P0001'; end if;
  if p_message_type in ('text', 'emoji') and nullif(btrim(p_content), '') is null then raise exception 'MESSAGE_REQUIRED' using errcode = 'P0001'; end if;
  if p_message_type in ('image', 'video') and (
    p_cloudinary_url is null
    or p_cloudinary_url !~ '^https://'
    or nullif(btrim(p_cloudinary_public_id), '') is null
    or p_cloudinary_resource_type not in ('image', 'video', 'raw')
  ) then raise exception 'MEDIA_UPLOAD_REQUIRED' using errcode = 'P0001'; end if;

  select * into v_room from public.chat_rooms where id = p_room_id for update;
  if v_room.id is null or v_sender not in (v_room.user_a, v_room.user_b) then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_room.status <> 'active' then raise exception 'ROOM_CLOSED' using errcode = 'P0001'; end if;
  v_receiver := case when v_sender = v_room.user_a then v_room.user_b else v_room.user_a end;

  select gender into v_sender_gender from public.users where id = v_sender;
  select is_verified and role = 'user' and not is_guest and not is_banned
  into v_receiver_is_host from public.users where id = v_receiver;
  if exists (select 1 from public.users where id = v_sender and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_sender, v_receiver), (v_receiver, v_sender))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  select free_chat_enabled, chat_rate_coins into v_free, v_rate
  from public.profiles where user_id = v_receiver;
  select coalesce((value #>> '{}')::integer, 10) into v_free_limit
  from public.platform_config where key = 'free_message_limit';

  if coalesce(v_receiver_is_host, false)
    and v_sender_gender = 'male'
    and v_room.room_type <> 'random'
    and v_room.message_count >= v_free_limit
    and not v_free
    and v_rate > 0 then
    select exists (
      select 1
      from public.wallet_transactions wt
      where wt.user_id = v_sender
        and wt.related_chat_id = p_room_id
        and wt.type = 'chat_spend'
        and wt.currency = 'coin'
        and wt.amount < 0
        and wt.created_at > clock_timestamp() - interval '60 seconds'
    ) into v_active_paid_minute;

    if not v_active_paid_minute then
      v_paid := true;
      select coalesce((value #>> '{}')::numeric, 0.8) into v_ratio
      from public.platform_config where key = 'bean_payout_ratio';
      v_bean_credit := round(v_rate * v_ratio, 2);

      perform 1 from public.wallets
      where user_id in (v_sender, v_receiver)
      order by user_id for update;

      select coins_balance into v_sender_balance from public.wallets where user_id = v_sender;
      if v_sender_balance < v_rate then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;

      update public.wallets
      set coins_balance = coins_balance - v_rate
      where user_id = v_sender returning coins_balance into v_sender_balance;
      update public.wallets
      set beans_balance = beans_balance + v_bean_credit,
          lifetime_beans_earned = lifetime_beans_earned + v_bean_credit
      where user_id = v_receiver returning beans_balance into v_receiver_balance;
    end if;
  end if;

  insert into public.messages (
    id, room_id, sender_id, message_type, content, cloudinary_url,
    cloudinary_public_id, cloudinary_resource_type, expires_at, is_paid, coins_charged
  )
  values (
    v_message_id, p_room_id, v_sender, p_message_type, nullif(btrim(p_content), ''),
    p_cloudinary_url, nullif(btrim(p_cloudinary_public_id), ''), p_cloudinary_resource_type,
    clock_timestamp() + interval '24 hours', v_paid, case when v_paid then v_rate else 0 end
  )
  returning * into v_message;

  if v_paid then
    insert into public.wallet_transactions
      (user_id, type, currency, amount, balance_after, related_chat_id, related_message_id, idempotency_key)
    values
      (v_sender, 'chat_spend', 'coin', -v_rate, v_sender_balance, p_room_id, v_message_id, 'chat-minute:' || p_room_id || ':' || v_sender || ':' || v_message_id || ':spend'),
      (v_receiver, 'bean_credit', 'bean', v_bean_credit, v_receiver_balance, p_room_id, v_message_id, 'chat-minute:' || p_room_id || ':' || v_sender || ':' || v_message_id || ':earn');
  end if;

  update public.chat_rooms
  set message_count = message_count + 1,
      is_paywalled = is_paywalled or v_paid or v_active_paid_minute,
      last_message_at = now()
  where id = p_room_id;
  return v_message;
end;
$$;

create or replace function public.send_tip(
  p_room_id uuid,
  p_amount numeric,
  p_call_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_receiver uuid;
  v_amount numeric(14, 2) := round(coalesce(p_amount, 0), 2);
  v_sender_balance numeric(14, 2);
  v_receiver_balance numeric(14, 2);
  v_ratio numeric := 0.8;
  v_credit numeric(14, 2);
  v_tip_id uuid := gen_random_uuid();
begin
  if v_sender is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if v_amount < 1 or v_amount > 100000 then raise exception 'INVALID_TIP_AMOUNT' using errcode = 'P0001'; end if;

  select case when user_a = v_sender then user_b else user_a end into v_receiver
  from public.chat_rooms
  where id = p_room_id and v_sender in (user_a, user_b) and status = 'active';

  if v_receiver is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_sender and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.users
    where id = v_receiver and role = 'user' and is_guest = false and is_banned = false and is_verified = true
  ) then raise exception 'RECIPIENT_NOT_HOST' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_sender, v_receiver), (v_receiver, v_sender))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  if p_call_id is not null and not exists (
    select 1 from public.calls
    where id = p_call_id and room_id = p_room_id and status = 'ongoing' and v_sender in (caller_id, receiver_id)
  ) then raise exception 'CALL_NOT_FOUND' using errcode = 'P0001'; end if;

  perform 1 from public.wallets where user_id in (v_sender, v_receiver) order by user_id for update;
  select coins_balance into v_sender_balance from public.wallets where user_id = v_sender;
  if v_sender_balance < v_amount then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;

  select coalesce((value #>> '{}')::numeric, 0.8) into v_ratio
  from public.platform_config where key = 'bean_payout_ratio';
  v_credit := round(v_amount * v_ratio, 2);

  update public.wallets set coins_balance = coins_balance - v_amount
  where user_id = v_sender returning coins_balance into v_sender_balance;
  update public.wallets
  set beans_balance = beans_balance + v_credit,
      lifetime_beans_earned = lifetime_beans_earned + v_credit
  where user_id = v_receiver returning beans_balance into v_receiver_balance;

  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, related_chat_id, related_call_id, idempotency_key)
  values
    (v_sender, 'tip_spend', 'coin', -v_amount, v_sender_balance, p_room_id, p_call_id, 'tip:' || v_tip_id || ':spend'),
    (v_receiver, 'tip_earn', 'bean', v_credit, v_receiver_balance, p_room_id, p_call_id, 'tip:' || v_tip_id || ':earn');

  return v_sender_balance;
end;
$$;

create or replace function public.request_withdrawal(
  p_beans numeric,
  p_payout_method text default 'upi',
  p_upi_id text default null,
  p_account_holder text default null,
  p_bank_account text default null,
  p_ifsc text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_balance numeric(14, 2);
  v_bean_value numeric := 0.8;
  v_id uuid := gen_random_uuid();
  v_method text := lower(btrim(coalesce(p_payout_method, 'upi')));
  v_upi text := nullif(lower(btrim(coalesce(p_upi_id, ''))), '');
  v_holder text := nullif(btrim(coalesce(p_account_holder, '')), '');
  v_account text := nullif(regexp_replace(coalesce(p_bank_account, ''), '[[:space:]]+', '', 'g'), '');
  v_ifsc text := nullif(upper(regexp_replace(coalesce(p_ifsc, ''), '[[:space:]]+', '', 'g')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.users
    where id = v_user and role = 'user' and is_guest = false and is_banned = false and is_verified = true
  ) then raise exception 'HOST_VERIFICATION_REQUIRED' using errcode = '42501'; end if;
  if p_beans < 1 then raise exception 'INVALID_WITHDRAWAL_AMOUNT' using errcode = 'P0001'; end if;
  if v_method not in ('upi', 'bank') then raise exception 'INVALID_PAYOUT_METHOD' using errcode = 'P0001'; end if;

  if v_method = 'upi' then
    if v_upi is null or char_length(v_upi) < 5 or position('@' in v_upi) <= 1 then
      raise exception 'UPI_ID_REQUIRED' using errcode = 'P0001';
    end if;
  else
    if v_holder is null or char_length(v_holder) < 2 then raise exception 'ACCOUNT_HOLDER_REQUIRED' using errcode = 'P0001'; end if;
    if v_account is null or char_length(v_account) < 6 then raise exception 'BANK_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;
    if v_ifsc is null or char_length(v_ifsc) < 4 then raise exception 'IFSC_REQUIRED' using errcode = 'P0001'; end if;
  end if;

  select beans_balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance is null then raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_balance < p_beans then raise exception 'INSUFFICIENT_BEANS' using errcode = 'P0001'; end if;

  select coalesce((value #>> '{}')::numeric, 0.8) into v_bean_value
  from public.platform_config where key = 'bean_inr_value';

  update public.wallets set beans_balance = beans_balance - p_beans
  where user_id = v_user returning beans_balance into v_balance;

  insert into public.withdrawal_requests (
    id, user_id, beans_requested, inr_amount, payout_method, payout_upi_id,
    payout_account_holder, payout_bank_account, payout_ifsc
  )
  values (
    v_id, v_user, round(p_beans, 2), round(p_beans * v_bean_value, 2), v_method,
    case when v_method = 'upi' then v_upi else null end,
    case when v_method = 'bank' then v_holder else null end,
    case when v_method = 'bank' then v_account else null end,
    case when v_method = 'bank' then v_ifsc else null end
  );

  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, idempotency_key, status)
  values (v_user, 'bean_withdrawal', 'bean', -p_beans, v_balance, 'withdrawal:' || v_id, 'pending');

  return v_id;
end;
$$;

create or replace function public.admin_adjust_wallet(p_target_user uuid, p_currency text, p_amount numeric, p_notes text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_balance numeric(14, 2);
  v_action uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_currency not in ('coin', 'bean') or p_amount = 0 then raise exception 'INVALID_ADJUSTMENT' using errcode = 'P0001'; end if;
  if p_currency = 'bean' and not exists (
    select 1 from public.users
    where id = p_target_user and role = 'user' and is_guest = false and is_banned = false and is_verified = true
  ) then raise exception 'HOST_VERIFICATION_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(btrim(p_notes)) < 3 then raise exception 'NOTES_REQUIRED' using errcode = 'P0001'; end if;
  perform 1 from public.wallets where user_id = p_target_user for update;
  if p_currency = 'coin' then
    update public.wallets set coins_balance = coins_balance + p_amount
    where user_id = p_target_user and coins_balance + p_amount >= 0 returning coins_balance into v_balance;
  else
    update public.wallets set beans_balance = beans_balance + p_amount
    where user_id = p_target_user and beans_balance + p_amount >= 0 returning beans_balance into v_balance;
  end if;
  if v_balance is null then raise exception 'ADJUSTMENT_OVERDRAFT' using errcode = 'P0001'; end if;
  insert into public.wallet_transactions (user_id, type, currency, amount, balance_after, idempotency_key)
  values (p_target_user, 'admin_adjustment', p_currency, p_amount, v_balance, 'admin:' || v_action);
  insert into public.admin_actions (id, admin_id, action_type, target_user_id, notes)
  values (v_action, v_admin, 'wallet_adjust', p_target_user, btrim(p_notes));
  return v_balance;
end;
$$;

revoke all on function public.start_call(uuid, text) from public, anon;
revoke all on function public.end_call(uuid) from public, anon;
revoke all on function public.send_message(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.send_tip(uuid, numeric, uuid) from public, anon;
revoke all on function public.request_withdrawal(numeric, text, text, text, text, text) from public, anon;
revoke all on function public.admin_adjust_wallet(uuid, text, numeric, text) from public, anon, authenticated;

grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.send_tip(uuid, numeric, uuid) to authenticated;
grant execute on function public.request_withdrawal(numeric, text, text, text, text, text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid, text, numeric, text) to authenticated;
