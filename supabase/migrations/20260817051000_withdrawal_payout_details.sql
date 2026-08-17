alter table public.withdrawal_requests
add column if not exists payout_method text not null default 'upi',
add column if not exists payout_upi_id text,
add column if not exists payout_account_holder text,
add column if not exists payout_bank_account text,
add column if not exists payout_ifsc text;

update public.withdrawal_requests
set payout_upi_id = coalesce(payout_upi_id, 'legacy@manual')
where payout_method = 'upi'
  and payout_upi_id is null;

alter table public.withdrawal_requests
drop constraint if exists withdrawal_requests_payout_method_check;

alter table public.withdrawal_requests
add constraint withdrawal_requests_payout_method_check
check (payout_method in ('upi', 'bank'));

alter table public.withdrawal_requests
drop constraint if exists withdrawal_requests_payout_details_check;

alter table public.withdrawal_requests
add constraint withdrawal_requests_payout_details_check
check (
  (
    payout_method = 'upi'
    and payout_upi_id is not null
    and char_length(payout_upi_id) between 5 and 120
  )
  or (
    payout_method = 'bank'
    and payout_account_holder is not null
    and payout_bank_account is not null
    and payout_ifsc is not null
    and char_length(payout_account_holder) between 2 and 120
    and char_length(payout_bank_account) between 6 and 34
    and char_length(payout_ifsc) between 4 and 20
  )
);

drop function if exists public.request_withdrawal(numeric);

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
  if p_beans < 1 then raise exception 'INVALID_WITHDRAWAL_AMOUNT' using errcode = 'P0001'; end if;
  if v_method not in ('upi', 'bank') then raise exception 'INVALID_PAYOUT_METHOD' using errcode = 'P0001'; end if;

  if v_method = 'upi' then
    if v_upi is null or char_length(v_upi) < 5 or position('@' in v_upi) <= 1 then
      raise exception 'UPI_ID_REQUIRED' using errcode = 'P0001';
    end if;
  else
    if v_holder is null or char_length(v_holder) < 2 then
      raise exception 'ACCOUNT_HOLDER_REQUIRED' using errcode = 'P0001';
    end if;
    if v_account is null or char_length(v_account) < 6 then
      raise exception 'BANK_ACCOUNT_REQUIRED' using errcode = 'P0001';
    end if;
    if v_ifsc is null or char_length(v_ifsc) < 4 then
      raise exception 'IFSC_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  select beans_balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance is null then raise exception 'WALLET_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_balance < p_beans then raise exception 'INSUFFICIENT_BEANS' using errcode = 'P0001'; end if;

  select coalesce((value #>> '{}')::numeric, 0.8) into v_bean_value
  from public.platform_config where key = 'bean_inr_value';

  update public.wallets set beans_balance = beans_balance - p_beans
  where user_id = v_user returning beans_balance into v_balance;

  insert into public.withdrawal_requests (
    id,
    user_id,
    beans_requested,
    inr_amount,
    payout_method,
    payout_upi_id,
    payout_account_holder,
    payout_bank_account,
    payout_ifsc
  )
  values (
    v_id,
    v_user,
    round(p_beans, 2),
    round(p_beans * v_bean_value, 2),
    v_method,
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

grant execute on function public.request_withdrawal(numeric, text, text, text, text, text) to authenticated;
