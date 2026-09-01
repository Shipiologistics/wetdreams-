begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'contract-a@example.test', '{"provider":"email","providers":["email"]}', '{"display_name":"Contract A","username":"contract_a"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'contract-b@example.test', '{"provider":"email","providers":["email"]}', '{"display_name":"Contract B","username":"contract_b"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'contract-bot@example.test', '{"provider":"email","providers":["email"]}', '{"display_name":"Contract Bot","username":"contract_bot"}', now(), now());

update public.users set role = 'bot' where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set chat_rate_coins = 2, audio_call_rate_coins = 10
where user_id = '10000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $contract$
declare
  v_room uuid;
  v_bot_room uuid;
  v_intent uuid;
  v_call uuid;
  v_match uuid;
  v_balance numeric;
  v_count integer;
  v_status text;
begin
  if not exists (select 1 from public.users where id = auth.uid()) then
    raise exception 'auth provisioning trigger failed';
  end if;
  select count(*) into v_count from public.wallets;
  if v_count <> 1 then raise exception 'wallet RLS leaked rows: %', v_count; end if;

  v_intent := public.create_payment_intent(100);
  v_balance := public.complete_dummy_payment(v_intent);
  if v_balance <> 100 then raise exception 'dummy topup failed: %', v_balance; end if;

  v_room := public.create_or_get_direct_room('10000000-0000-4000-8000-000000000002');
  for i in 1..11 loop
    perform public.send_message(v_room, 'text', 'contract message ' || i, null);
  end loop;
  select coins_balance into v_balance from public.wallets where user_id = auth.uid();
  if v_balance <> 95 then raise exception 'message charging failed: %', v_balance; end if;
  select count(*) into v_count from public.messages where room_id = v_room;
  if v_count <> 11 then raise exception 'message insert failed: %', v_count; end if;

  v_call := public.start_call(v_room, 'audio');
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  if not public.respond_to_call(v_call, true) then raise exception 'call billing failed'; end if;
  select beans_balance into v_balance from public.wallets where user_id = auth.uid();
  if v_balance <> 20 then raise exception 'bean credit failed: %', v_balance; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  v_bot_room := public.create_or_get_direct_room('10000000-0000-4000-8000-000000000003');
  perform public.send_message(v_bot_room, 'text', 'hello bot', null);
  select count(*) into v_count from public.messages where room_id = v_bot_room;
  if v_count <> 2 then raise exception 'bot reply failed: %', v_count; end if;
  v_call := public.start_call(v_bot_room, 'audio');
  select status into v_status from public.calls where id = v_call;
  if v_status <> 'ongoing' then raise exception 'bot call did not auto-accept: %', v_status; end if;

  v_match := public.match_random_chat();
  if v_match is not null then raise exception 'first random match should wait'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  v_match := public.match_random_chat();
  if v_match is null then raise exception 'second random match failed'; end if;
  select status into v_status from public.random_chat_queue where user_id = auth.uid() and matched_room_id = v_match;
  if v_status <> 'matched' then raise exception 'random queue state failed: %', v_status; end if;

  begin
    update public.wallet_transactions set amount = 1 where user_id = auth.uid();
    raise exception 'ledger write permission was not blocked';
  exception when insufficient_privilege then
    null;
  end;
end;
$contract$;

reset role;

do $ledger$
begin
  begin
    update public.wallet_transactions set amount = 1
    where id = (select id from public.wallet_transactions limit 1);
    raise exception 'ledger trigger was not enforced';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WALLET_LEDGER_IS_IMMUTABLE' then raise; end if;
  end;
end;
$ledger$;

update public.users
set role = 'admin'
where id = '10000000-0000-4000-8000-000000000001';

insert into public.withdrawal_requests (
  id,
  user_id,
  beans_requested,
  inr_amount,
  payout_method,
  payout_upi_id
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  10,
  8,
  'upi',
  'contract@upi'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.admin_review_withdrawal(
  '20000000-0000-4000-8000-000000000001',
  true,
  'ok'
);
reset role;

do $withdrawal_notes$
declare
  v_status text;
  v_notes text;
begin
  select status into v_status
  from public.withdrawal_requests
  where id = '20000000-0000-4000-8000-000000000001';

  select notes into v_notes
  from public.admin_actions
  where action_type = 'approve_withdrawal'
    and target_user_id = '10000000-0000-4000-8000-000000000002'
  order by created_at desc
  limit 1;

  if v_status <> 'complete' or v_notes <> 'Payment completed' then
    raise exception 'withdrawal completion audit failed: status %, notes %', v_status, v_notes;
  end if;
end;
$withdrawal_notes$;

rollback;
