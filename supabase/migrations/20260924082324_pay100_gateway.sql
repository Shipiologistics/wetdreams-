alter table public.payment_intents
  add column if not exists gateway_order_id text,
  add column if not exists gateway_request_id text,
  add column if not exists gateway_status text,
  add column if not exists expires_at timestamptz;

create unique index if not exists payment_intents_gateway_order_unique
  on public.payment_intents (gateway, gateway_order_id)
  where gateway_order_id is not null;

create or replace function public.complete_pay100_payment(
  p_order_id text,
  p_amount_inr numeric
)
returns table (
  user_id uuid,
  coins_credited numeric,
  coins_balance numeric,
  already_completed boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_intent public.payment_intents;
  v_balance numeric(14, 2);
begin
  if nullif(btrim(p_order_id), '') is null or p_amount_inr is null or p_amount_inr <= 0 then
    raise exception 'INVALID_PAYMENT_DETAILS' using errcode = 'P0001';
  end if;

  select * into v_intent
  from public.payment_intents
  where gateway = 'pay100' and gateway_order_id = btrim(p_order_id)
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if round(v_intent.amount_inr, 2) <> round(p_amount_inr, 2) then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  if v_intent.status = 'success' then
    select w.coins_balance into v_balance
    from public.wallets w
    where w.user_id = v_intent.user_id;

    return query select
      v_intent.user_id,
      v_intent.coins_requested,
      v_balance,
      true;
    return;
  end if;

  if v_intent.status <> 'pending' then
    raise exception 'PAYMENT_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.payment_intents
  set status = 'success',
      gateway_status = 'SUCCESS',
      completed_at = now()
  where id = v_intent.id;

  update public.wallets
  set coins_balance = coins_balance + v_intent.coins_requested,
      lifetime_coins_purchased = lifetime_coins_purchased + v_intent.coins_requested
  where wallets.user_id = v_intent.user_id
  returning wallets.coins_balance into v_balance;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.wallet_transactions (
    user_id,
    type,
    currency,
    amount,
    balance_after,
    payment_gateway_ref,
    idempotency_key
  ) values (
    v_intent.user_id,
    'topup',
    'coin',
    v_intent.coins_requested,
    v_balance,
    'pay100:' || v_intent.gateway_order_id,
    'topup:pay100:' || v_intent.gateway_order_id
  );

  return query select
    v_intent.user_id,
    v_intent.coins_requested,
    v_balance,
    false;
end;
$$;

revoke all on function public.complete_pay100_payment(text, numeric) from public, anon, authenticated;
grant execute on function public.complete_pay100_payment(text, numeric) to service_role;
