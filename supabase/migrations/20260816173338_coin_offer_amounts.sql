drop function if exists public.create_payment_intent(numeric);

create or replace function public.create_payment_intent(
  p_coins numeric,
  p_amount_inr numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_amount numeric := coalesce(p_amount_inr, p_coins);
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_coins <= 0 or v_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  insert into public.payment_intents (user_id, coins_requested, amount_inr)
  values (v_user, round(p_coins, 2), round(v_amount, 2)) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_payment_intent(numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_payment_intent(numeric, numeric) to authenticated;
