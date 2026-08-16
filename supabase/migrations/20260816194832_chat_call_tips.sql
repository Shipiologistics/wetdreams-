alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in (
    'topup', 'chat_spend', 'call_spend', 'bean_credit',
    'bean_withdrawal', 'refund', 'admin_adjustment',
    'tip_spend', 'tip_earn'
  ));

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
  where id = p_room_id
    and v_sender in (user_a, user_b)
    and status = 'active';

  if v_receiver is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_sender and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if not exists (
    select 1
    from public.users
    where id = v_receiver
      and role = 'user'
      and is_guest = false
      and is_banned = false
  ) then
    raise exception 'USER_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_sender, v_receiver), (v_receiver, v_sender))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  if p_call_id is not null and not exists (
    select 1
    from public.calls
    where id = p_call_id
      and room_id = p_room_id
      and status = 'ongoing'
      and v_sender in (caller_id, receiver_id)
  ) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1 from public.wallets
  where user_id in (v_sender, v_receiver)
  order by user_id
  for update;

  select coins_balance into v_sender_balance from public.wallets where user_id = v_sender;
  if v_sender_balance < v_amount then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;

  select coalesce((value #>> '{}')::numeric, 0.8) into v_ratio
  from public.platform_config where key = 'bean_payout_ratio';
  v_credit := round(v_amount * v_ratio, 2);

  update public.wallets
  set coins_balance = coins_balance - v_amount
  where user_id = v_sender
  returning coins_balance into v_sender_balance;

  update public.wallets
  set beans_balance = beans_balance + v_credit,
      lifetime_beans_earned = lifetime_beans_earned + v_credit
  where user_id = v_receiver
  returning beans_balance into v_receiver_balance;

  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, related_chat_id, related_call_id, idempotency_key)
  values
    (v_sender, 'tip_spend', 'coin', -v_amount, v_sender_balance, p_room_id, p_call_id, 'tip:' || v_tip_id || ':spend'),
    (v_receiver, 'tip_earn', 'bean', v_credit, v_receiver_balance, p_room_id, p_call_id, 'tip:' || v_tip_id || ':earn');

  return v_sender_balance;
end;
$$;

revoke all on function public.send_tip(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.send_tip(uuid, numeric, uuid) to authenticated;
