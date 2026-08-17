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
  if exists (select 1 from public.users where id = v_sender and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_sender, v_receiver), (v_receiver, v_sender))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  select free_chat_enabled, chat_rate_coins into v_free, v_rate
  from public.profiles where user_id = v_receiver;
  select coalesce((value #>> '{}')::integer, 10) into v_free_limit
  from public.platform_config where key = 'free_message_limit';

  if v_sender_gender = 'male'
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
    id,
    room_id,
    sender_id,
    message_type,
    content,
    cloudinary_url,
    cloudinary_public_id,
    cloudinary_resource_type,
    expires_at,
    is_paid,
    coins_charged
  )
  values (
    v_message_id,
    p_room_id,
    v_sender,
    p_message_type,
    nullif(btrim(p_content), ''),
    p_cloudinary_url,
    nullif(btrim(p_cloudinary_public_id), ''),
    p_cloudinary_resource_type,
    clock_timestamp() + interval '24 hours',
    v_paid,
    case when v_paid then v_rate else 0 end
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

revoke all on function public.send_message(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.send_message(uuid, text, text, text, text, text) to authenticated;
