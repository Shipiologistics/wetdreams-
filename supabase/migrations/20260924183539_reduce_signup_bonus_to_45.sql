insert into public.platform_config (key, value)
values ('signup_bonus_enabled', '0'::jsonb)
on conflict (key) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_username text;
  v_display_name text;
  v_gender text;
  v_signup_bonus numeric(14, 2) := 0;
  v_signup_bonus_enabled boolean := false;
begin
  v_base := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1), 'user'),
    '[^a-zA-Z0-9_]', '', 'g'
  ));
  v_base := left(coalesce(nullif(v_base, ''), 'user'), 21);
  if char_length(v_base) < 3 then
    v_base := 'user';
  end if;
  v_username := v_base || '_' || left(replace(new.id::text, '-', ''), 8);
  v_display_name := left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Guest'), 60);
  v_gender := case
    when new.raw_user_meta_data ->> 'gender' in ('male', 'female', 'other') then new.raw_user_meta_data ->> 'gender'
    else 'male'
  end;
  v_signup_bonus_enabled := coalesce((
    select (value #>> '{}')::numeric = 1
    from public.platform_config
    where key = 'signup_bonus_enabled'
  ), false);
  if v_signup_bonus_enabled then
    v_signup_bonus := 45;
  end if;

  insert into public.users (id, username, display_name, gender, is_guest)
  values (new.id, v_username, v_display_name, v_gender, coalesce(new.is_anonymous, false));

  insert into public.profiles (user_id) values (new.id);

  insert into public.wallets (user_id, coins_balance, lifetime_coins_purchased)
  values (new.id, v_signup_bonus, v_signup_bonus);

  if v_signup_bonus > 0 then
    insert into public.wallet_transactions (
      user_id,
      type,
      currency,
      amount,
      balance_after,
      payment_gateway_ref,
      idempotency_key
    )
    values (
      new.id,
      'topup',
      'coin',
      v_signup_bonus,
      v_signup_bonus,
      'signup_bonus',
      'signup_bonus:' || new.id::text
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.admin_update_platform_config(
  p_key text,
  p_value numeric,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_clean_key text := btrim(coalesce(p_key, ''));
  v_value jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;

  if v_clean_key = 'bean_inr_value' then
    if p_value < 0.01 or p_value > 100 then raise exception 'INVALID_BEAN_VALUE' using errcode = 'P0001'; end if;
    v_value := to_jsonb(round(p_value, 2));
  elsif v_clean_key = 'bean_payout_ratio' then
    if p_value < 0 or p_value > 1 then raise exception 'INVALID_PAYOUT_RATIO' using errcode = 'P0001'; end if;
    v_value := to_jsonb(round(p_value, 4));
  elsif v_clean_key = 'free_message_limit' then
    if p_value < 0 or p_value > 10000 then raise exception 'INVALID_FREE_LIMIT' using errcode = 'P0001'; end if;
    v_value := to_jsonb(floor(p_value)::integer);
  elsif v_clean_key = 'signup_bonus_enabled' then
    if p_value not in (0, 1) then raise exception 'INVALID_SIGNUP_BONUS_SETTING' using errcode = 'P0001'; end if;
    v_value := to_jsonb(floor(p_value)::integer);
  else
    raise exception 'INVALID_CONFIG_KEY' using errcode = 'P0001';
  end if;

  insert into public.platform_config (key, value, updated_at)
  values (v_clean_key, v_value, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  insert into public.admin_actions (admin_id, action_type, notes)
  values (
    v_admin,
    'settings_update',
    coalesce(nullif(btrim(p_notes), ''), 'Updated ' || v_clean_key || ' to ' || p_value::text)
  );
end;
$$;

revoke all on function public.admin_update_platform_config(text, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_update_platform_config(text, numeric, text) to authenticated;
