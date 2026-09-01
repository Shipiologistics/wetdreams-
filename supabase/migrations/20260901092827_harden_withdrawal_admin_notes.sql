create or replace function public.admin_review_withdrawal(
  p_request_id uuid,
  p_approve boolean,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_request public.withdrawal_requests%rowtype;
  v_balance numeric(14, 2);
  v_notes text := left(btrim(coalesce(p_notes, '')), 2000);
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'WITHDRAWAL_NOT_PENDING' using errcode = 'P0001';
  end if;

  if char_length(v_notes) < 3 then
    v_notes := case
      when p_approve then 'Payment completed'
      else 'Withdrawal rejected by admin'
    end;
  end if;

  if p_approve then
    update public.withdrawal_requests
    set status = 'complete', admin_id = v_admin, processed_at = now()
    where id = p_request_id;

    update public.wallets
    set lifetime_beans_withdrawn = lifetime_beans_withdrawn + v_request.beans_requested
    where user_id = v_request.user_id;
  else
    update public.wallets
    set beans_balance = beans_balance + v_request.beans_requested
    where user_id = v_request.user_id
    returning beans_balance into v_balance;

    update public.withdrawal_requests
    set status = 'rejected', admin_id = v_admin, processed_at = now()
    where id = p_request_id;

    insert into public.wallet_transactions (
      user_id,
      type,
      currency,
      amount,
      balance_after,
      idempotency_key
    )
    values (
      v_request.user_id,
      'refund',
      'bean',
      v_request.beans_requested,
      v_balance,
      'withdrawal:' || p_request_id || ':refund'
    );
  end if;

  insert into public.admin_actions (admin_id, action_type, target_user_id, notes)
  values (
    v_admin,
    case when p_approve then 'approve_withdrawal' else 'reject_withdrawal' end,
    v_request.user_id,
    v_notes
  );
end;
$$;

revoke all on function public.admin_review_withdrawal(uuid, boolean, text)
from public, anon, authenticated;

grant execute on function public.admin_review_withdrawal(uuid, boolean, text)
to authenticated;
