create extension if not exists pgcrypto with schema extensions;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  gender text check (gender in ('male', 'female', 'other')),
  role text not null default 'user' check (role in ('user', 'bot', 'admin')),
  is_verified boolean not null default false,
  is_banned boolean not null default false,
  status text not null default 'offline' check (status in ('online', 'offline', 'busy', 'in_call')),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  bio text not null default '' check (char_length(bio) <= 500),
  age integer check (age between 18 and 120),
  location text check (char_length(location) <= 100),
  languages text[] not null default '{}',
  real_meet_available boolean not null default false,
  free_chat_enabled boolean not null default false,
  chat_rate_coins numeric(12, 2) not null default 5 check (chat_rate_coins between 0 and 10000),
  audio_call_rate_coins numeric(12, 2) not null default 20 check (audio_call_rate_coins between 0 and 100000),
  video_call_rate_coins numeric(12, 2) not null default 40 check (video_call_rate_coins between 0 and 100000),
  min_topup_required boolean not null default false,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  cloudinary_public_id text not null,
  cloudinary_url text not null check (cloudinary_url ~ '^https://'),
  position integer not null check (position between 0 and 11),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, position),
  unique (user_id, cloudinary_public_id)
);

create unique index profile_media_one_primary_idx
  on public.profile_media (user_id) where is_primary;

create table public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  coins_balance numeric(14, 2) not null default 0 check (coins_balance >= 0),
  beans_balance numeric(14, 2) not null default 0 check (beans_balance >= 0),
  lifetime_coins_purchased numeric(14, 2) not null default 0 check (lifetime_coins_purchased >= 0),
  lifetime_beans_earned numeric(14, 2) not null default 0 check (lifetime_beans_earned >= 0),
  lifetime_beans_withdrawn numeric(14, 2) not null default 0 check (lifetime_beans_withdrawn >= 0),
  updated_at timestamptz not null default now()
);

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id),
  user_b uuid not null references public.users(id),
  room_type text not null default 'direct' check (room_type in ('direct', 'random', 'bot')),
  message_count integer not null default 0 check (message_count >= 0),
  is_paywalled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'closed', 'reported')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a <> user_b)
);

create unique index chat_rooms_active_direct_pair_idx
  on public.chat_rooms (least(user_a, user_b), greatest(user_a, user_b), room_type)
  where status = 'active' and room_type in ('direct', 'bot');
create index chat_rooms_user_a_recent_idx on public.chat_rooms (user_a, last_message_at desc);
create index chat_rooms_user_b_recent_idx on public.chat_rooms (user_b, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'emoji', 'system')),
  content text check (char_length(content) <= 4000),
  cloudinary_url text check (cloudinary_url is null or cloudinary_url ~ '^https://'),
  is_paid boolean not null default false,
  coins_charged numeric(12, 2) not null default 0 check (coins_charged >= 0),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (message_type in ('text', 'emoji', 'system') and nullif(btrim(content), '') is not null)
    or (message_type in ('image', 'video') and cloudinary_url is not null)
  )
);

create index messages_room_created_idx on public.messages (room_id, created_at desc);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id),
  caller_id uuid not null references public.users(id),
  receiver_id uuid not null references public.users(id),
  call_type text not null check (call_type in ('audio', 'video')),
  agora_channel_name text unique,
  rate_per_minute numeric(12, 2) not null check (rate_per_minute >= 0),
  billed_minutes integer not null default 0 check (billed_minutes >= 0),
  status text not null default 'ringing' check (status in ('ringing', 'ongoing', 'ended', 'missed', 'rejected')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  coins_charged numeric(12, 2) not null default 0 check (coins_charged >= 0),
  created_at timestamptz not null default now(),
  check (caller_id <> receiver_id)
);

create index calls_participants_created_idx on public.calls (caller_id, receiver_id, created_at desc);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  type text not null check (type in (
    'topup', 'chat_spend', 'call_spend', 'bean_credit',
    'bean_withdrawal', 'refund', 'admin_adjustment'
  )),
  currency text not null check (currency in ('coin', 'bean')),
  amount numeric(14, 2) not null check (amount <> 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  related_chat_id uuid references public.chat_rooms(id),
  related_message_id uuid references public.messages(id),
  related_call_id uuid references public.calls(id),
  payment_gateway_ref text,
  idempotency_key text unique,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'reversed')),
  created_at timestamptz not null default now()
);

create index wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create table public.random_chat_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  matched_room_id uuid references public.chat_rooms(id),
  joined_at timestamptz not null default now(),
  check ((status = 'matched') = (matched_room_id is not null))
);

create index random_chat_waiting_idx
  on public.random_chat_queue (joined_at) where status = 'waiting';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id),
  reported_user_id uuid not null references public.users(id),
  room_id uuid references public.chat_rooms(id),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_id uuid references public.users(id),
  admin_notes text check (char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (reporter_id <> reported_user_id)
);

create index reports_status_created_idx on public.reports (status, created_at desc);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id),
  action_type text not null check (action_type in (
    'ban', 'unban', 'wallet_adjust', 'delete_message', 'close_room',
    'warn', 'resolve_report', 'approve_withdrawal', 'reject_withdrawal'
  )),
  target_user_id uuid references public.users(id),
  target_room_id uuid references public.chat_rooms(id),
  notes text not null check (char_length(notes) between 3 and 2000),
  created_at timestamptz not null default now()
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  favorite_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  check (user_id <> favorite_user_id)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid not null references public.users(id),
  rated_user_id uuid not null references public.users(id),
  room_id uuid not null references public.chat_rooms(id),
  score integer not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (rater_id, room_id),
  check (rater_id <> rated_user_id)
);

create table public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_config (key, value) values
  ('bean_payout_ratio', '0.8'::jsonb),
  ('bean_inr_value', '0.8'::jsonb),
  ('free_message_limit', '10'::jsonb),
  ('random_bot_offer_seconds', '30'::jsonb);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  coins_requested numeric(14, 2) not null check (coins_requested between 1 and 100000),
  amount_inr numeric(14, 2) not null check (amount_inr > 0),
  gateway text not null default 'dummy',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index payment_intents_user_created_idx on public.payment_intents (user_id, created_at desc);

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  beans_requested numeric(14, 2) not null check (beans_requested > 0),
  inr_amount numeric(14, 2) not null check (inr_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  admin_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index withdrawals_status_created_idx on public.withdrawal_requests (status, created_at desc);

create index admin_actions_admin_idx on public.admin_actions (admin_id);
create index admin_actions_target_room_idx on public.admin_actions (target_room_id);
create index admin_actions_target_user_idx on public.admin_actions (target_user_id);
create index blocks_blocked_idx on public.blocks (blocked_id);
create index calls_receiver_idx on public.calls (receiver_id);
create index calls_room_idx on public.calls (room_id);
create index favorites_favorite_user_idx on public.favorites (favorite_user_id);
create index messages_sender_idx on public.messages (sender_id);
create index random_chat_matched_room_idx on public.random_chat_queue (matched_room_id);
create index ratings_rated_user_idx on public.ratings (rated_user_id);
create index ratings_room_idx on public.ratings (room_id);
create index reports_admin_idx on public.reports (admin_id);
create index reports_reported_user_idx on public.reports (reported_user_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_room_idx on public.reports (room_id);
create index wallet_transactions_call_idx on public.wallet_transactions (related_call_id);
create index wallet_transactions_chat_idx on public.wallet_transactions (related_chat_id);
create index wallet_transactions_message_idx on public.wallet_transactions (related_message_id);
create index withdrawals_admin_idx on public.withdrawal_requests (admin_id);
create index withdrawals_user_idx on public.withdrawal_requests (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger wallets_set_updated_at before update on public.wallets
for each row execute function public.set_updated_at();
create trigger platform_config_set_updated_at before update on public.platform_config
for each row execute function public.set_updated_at();

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
  v_display_name := left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), v_base), 60);

  insert into public.users (id, username, display_name)
  values (new.id, v_username, v_display_name);
  insert into public.profiles (user_id) values (new.id);
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = 'admin' and not is_banned
  );
$$;

create or replace function public.enforce_media_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.media_type, 0));
  v_limit := case when new.media_type = 'image' then 10 else 2 end;
  select count(*) into v_count
  from public.profile_media
  where user_id = new.user_id and media_type = new.media_type;
  if v_count >= v_limit then
    raise exception 'MEDIA_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profile_media_enforce_limits
before insert on public.profile_media
for each row execute function public.enforce_media_limits();

create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WALLET_LEDGER_IS_IMMUTABLE' using errcode = 'P0001';
end;
$$;

create trigger wallet_transactions_immutable
before update or delete on public.wallet_transactions
for each row execute function public.prevent_ledger_mutation();

create or replace function public.create_or_get_direct_room(p_target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_room uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_target_user is null or p_target_user = v_user then raise exception 'INVALID_TARGET' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id in (v_user, p_target_user) and is_banned) then
    raise exception 'USER_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_user and blocked_id = p_target_user)
       or (blocker_id = p_target_user and blocked_id = v_user)
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  select id into v_room from public.chat_rooms
  where room_type = 'direct' and status = 'active'
    and least(user_a, user_b) = least(v_user, p_target_user)
    and greatest(user_a, user_b) = greatest(v_user, p_target_user)
  limit 1;

  if v_room is null then
    insert into public.chat_rooms (user_a, user_b, room_type)
    values (least(v_user, p_target_user), greatest(v_user, p_target_user), 'direct')
    on conflict (least(user_a, user_b), greatest(user_a, user_b), room_type)
      where status = 'active' and room_type in ('direct', 'bot')
    do nothing
    returning id into v_room;

    if v_room is null then
      select id into v_room from public.chat_rooms
      where room_type = 'direct' and status = 'active'
        and least(user_a, user_b) = least(v_user, p_target_user)
        and greatest(user_a, user_b) = greatest(v_user, p_target_user)
      limit 1;
    end if;
  end if;
  return v_room;
end;
$$;

create or replace function public.send_message(
  p_room_id uuid,
  p_message_type text,
  p_content text default null,
  p_cloudinary_url text default null
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
begin
  if v_sender is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_message_type not in ('text', 'image', 'video', 'emoji') then raise exception 'INVALID_MESSAGE_TYPE' using errcode = 'P0001'; end if;
  if p_message_type in ('text', 'emoji') and nullif(btrim(p_content), '') is null then raise exception 'MESSAGE_REQUIRED' using errcode = 'P0001'; end if;
  if p_message_type in ('image', 'video') and (p_cloudinary_url is null or p_cloudinary_url !~ '^https://') then raise exception 'MEDIA_URL_REQUIRED' using errcode = 'P0001'; end if;

  select * into v_room from public.chat_rooms where id = p_room_id for update;
  if v_room.id is null or v_sender not in (v_room.user_a, v_room.user_b) then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_room.status <> 'active' then raise exception 'ROOM_CLOSED' using errcode = 'P0001'; end if;
  v_receiver := case when v_sender = v_room.user_a then v_room.user_b else v_room.user_a end;

  if exists (select 1 from public.users where id = v_sender and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.blocks where (blocker_id, blocked_id) in ((v_sender, v_receiver), (v_receiver, v_sender))
  ) then raise exception 'USER_BLOCKED' using errcode = 'P0001'; end if;

  select free_chat_enabled, chat_rate_coins into v_free, v_rate
  from public.profiles where user_id = v_receiver;
  select coalesce((value #>> '{}')::integer, 10) into v_free_limit
  from public.platform_config where key = 'free_message_limit';

  if v_room.message_count >= v_free_limit and not v_free and v_rate > 0 then
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

  insert into public.messages (id, room_id, sender_id, message_type, content, cloudinary_url, is_paid, coins_charged)
  values (v_message_id, p_room_id, v_sender, p_message_type, nullif(btrim(p_content), ''), p_cloudinary_url, v_paid, case when v_paid then v_rate else 0 end)
  returning * into v_message;

  if v_paid then
    insert into public.wallet_transactions
      (user_id, type, currency, amount, balance_after, related_chat_id, related_message_id, idempotency_key)
    values
      (v_sender, 'chat_spend', 'coin', -v_rate, v_sender_balance, p_room_id, v_message_id, 'message:' || v_message_id || ':spend'),
      (v_receiver, 'bean_credit', 'bean', v_bean_credit, v_receiver_balance, p_room_id, v_message_id, 'message:' || v_message_id || ':earn');
  end if;

  update public.chat_rooms
  set message_count = message_count + 1,
      is_paywalled = is_paywalled or v_paid,
      last_message_at = now()
  where id = p_room_id;
  return v_message;
end;
$$;

create or replace function public.mark_room_read(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if not exists (select 1 from public.chat_rooms where id = p_room_id and v_user in (user_a, user_b)) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.messages set read_at = now()
  where room_id = p_room_id and sender_id <> v_user and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.respond_to_bot_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bot uuid;
  v_reply text;
begin
  select u.id into v_bot
  from public.chat_rooms r
  join public.users u on u.id = case when r.user_a = new.sender_id then r.user_b else r.user_a end
  where r.id = new.room_id and u.role = 'bot' and new.sender_id <> u.id;

  if v_bot is null then return new; end if;

  v_reply := (array[
    'That is interesting. Tell me a little more?',
    'I am listening. What happened next?',
    'You have my attention. How are you feeling about it?',
    'I like where this conversation is going. Keep talking.'
  ])[1 + floor(random() * 4)::integer];

  insert into public.messages (room_id, sender_id, message_type, content, created_at)
  values (new.room_id, v_bot, 'text', v_reply, clock_timestamp());
  update public.chat_rooms
  set message_count = message_count + 1, last_message_at = clock_timestamp()
  where id = new.room_id;
  return new;
end;
$$;

create trigger messages_bot_auto_reply
after insert on public.messages
for each row execute function public.respond_to_bot_message();

create or replace function public.create_payment_intent(p_coins numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_coins < 1 or p_coins > 100000 then raise exception 'INVALID_TOPUP_AMOUNT' using errcode = 'P0001'; end if;
  insert into public.payment_intents (user_id, coins_requested, amount_inr)
  values (v_user, round(p_coins, 2), round(p_coins, 2)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_dummy_payment(p_intent_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_intent public.payment_intents;
  v_balance numeric(14, 2);
begin
  select * into v_intent from public.payment_intents
  where id = p_intent_id and user_id = v_user for update;
  if v_intent.id is null then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_intent.status = 'success' then
    select coins_balance into v_balance from public.wallets where user_id = v_user;
    return v_balance;
  end if;
  if v_intent.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING' using errcode = 'P0001'; end if;

  update public.payment_intents set status = 'success', completed_at = now() where id = p_intent_id;
  update public.wallets
  set coins_balance = coins_balance + v_intent.coins_requested,
      lifetime_coins_purchased = lifetime_coins_purchased + v_intent.coins_requested
  where user_id = v_user returning coins_balance into v_balance;
  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, payment_gateway_ref, idempotency_key)
  values
    (v_user, 'topup', 'coin', v_intent.coins_requested, v_balance, 'dummy:' || p_intent_id, 'topup:' || p_intent_id);
  return v_balance;
end;
$$;

create or replace function public.request_withdrawal(p_beans numeric)
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
begin
  if p_beans < 1 then raise exception 'INVALID_WITHDRAWAL_AMOUNT' using errcode = 'P0001'; end if;
  select beans_balance into v_balance from public.wallets where user_id = v_user for update;
  if v_balance < p_beans then raise exception 'INSUFFICIENT_BEANS' using errcode = 'P0001'; end if;
  select coalesce((value #>> '{}')::numeric, 0.8) into v_bean_value
  from public.platform_config where key = 'bean_inr_value';
  update public.wallets set beans_balance = beans_balance - p_beans
  where user_id = v_user returning beans_balance into v_balance;
  insert into public.withdrawal_requests (id, user_id, beans_requested, inr_amount)
  values (v_id, v_user, round(p_beans, 2), round(p_beans * v_bean_value, 2));
  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, idempotency_key, status)
  values (v_user, 'bean_withdrawal', 'bean', -p_beans, v_balance, 'withdrawal:' || v_id, 'pending');
  return v_id;
end;
$$;

create or replace function public.match_random_chat()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_partner uuid;
  v_room uuid;
  v_existing public.random_chat_queue;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.users where id = v_user and is_banned) then raise exception 'ACCOUNT_BANNED' using errcode = 'P0001'; end if;

  select * into v_existing from public.random_chat_queue where user_id = v_user;
  if v_existing.status = 'matched' and v_existing.matched_room_id is not null then
    return v_existing.matched_room_id;
  end if;

  insert into public.random_chat_queue (user_id, status, matched_room_id, joined_at)
  values (v_user, 'waiting', null, now())
  on conflict (user_id) do update
  set status = 'waiting', matched_room_id = null, joined_at = now();

  select q.user_id into v_partner
  from public.random_chat_queue q
  join public.users u on u.id = q.user_id
  where q.status = 'waiting' and q.user_id <> v_user and not u.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id, b.blocked_id) in ((v_user, q.user_id), (q.user_id, v_user))
    )
  order by q.joined_at
  for update of q skip locked
  limit 1;

  if v_partner is null then return null; end if;

  insert into public.chat_rooms (user_a, user_b, room_type)
  values (least(v_user, v_partner), greatest(v_user, v_partner), 'random')
  returning id into v_room;

  update public.random_chat_queue
  set status = 'matched', matched_room_id = v_room
  where user_id in (v_user, v_partner) and status = 'waiting';

  if (select count(*) from public.random_chat_queue where matched_room_id = v_room) <> 2 then
    raise exception 'MATCH_RETRY' using errcode = '40001';
  end if;
  return v_room;
end;
$$;

create or replace function public.cancel_random_chat()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.random_chat_queue
  set status = 'cancelled', matched_room_id = null
  where user_id = (select auth.uid()) and status = 'waiting';
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
  if p_call_type not in ('audio', 'video') then raise exception 'INVALID_CALL_TYPE' using errcode = 'P0001'; end if;
  select case when user_a = v_caller then user_b else user_a end into v_receiver
  from public.chat_rooms where id = p_room_id and v_caller in (user_a, user_b) and status = 'active';
  if v_receiver is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  select case when p_call_type = 'audio' then audio_call_rate_coins else video_call_rate_coins end
  into v_rate from public.profiles where user_id = v_receiver;
  select coins_balance into v_balance from public.wallets where user_id = v_caller;
  if v_balance < v_rate then raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001'; end if;
  insert into public.calls (id, room_id, caller_id, receiver_id, call_type, agora_channel_name, rate_per_minute)
  values (v_id, p_room_id, v_caller, v_receiver, p_call_type, 'call_' || replace(v_id::text, '-', ''), v_rate);
  if exists (select 1 from public.users where id = v_receiver and role = 'bot') then
    perform public.charge_call_minute(v_id);
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
  v_sender_balance numeric(14, 2);
  v_receiver_balance numeric(14, 2);
  v_ratio numeric := 0.8;
  v_credit numeric(14, 2);
  v_minute integer;
begin
  select * into v_call from public.calls where id = p_call_id for update;
  if v_call.id is null or v_user not in (v_call.caller_id, v_call.receiver_id) then raise exception 'CALL_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_call.status not in ('ringing', 'ongoing') then return false; end if;
  perform 1 from public.wallets where user_id in (v_call.caller_id, v_call.receiver_id) order by user_id for update;
  select coins_balance into v_sender_balance from public.wallets where user_id = v_call.caller_id;
  if v_sender_balance < v_call.rate_per_minute then
    update public.calls set status = 'ended', ended_at = now(), duration_seconds = coalesce(extract(epoch from now() - started_at)::integer, 0) where id = p_call_id;
    return false;
  end if;
  select coalesce((value #>> '{}')::numeric, 0.8) into v_ratio from public.platform_config where key = 'bean_payout_ratio';
  v_credit := round(v_call.rate_per_minute * v_ratio, 2);
  v_minute := v_call.billed_minutes + 1;
  update public.wallets set coins_balance = coins_balance - v_call.rate_per_minute
  where user_id = v_call.caller_id returning coins_balance into v_sender_balance;
  update public.wallets set beans_balance = beans_balance + v_credit, lifetime_beans_earned = lifetime_beans_earned + v_credit
  where user_id = v_call.receiver_id returning beans_balance into v_receiver_balance;
  update public.calls set status = 'ongoing', started_at = coalesce(started_at, now()), billed_minutes = v_minute,
    coins_charged = coins_charged + v_call.rate_per_minute where id = p_call_id;
  insert into public.wallet_transactions
    (user_id, type, currency, amount, balance_after, related_call_id, idempotency_key)
  values
    (v_call.caller_id, 'call_spend', 'coin', -v_call.rate_per_minute, v_sender_balance, p_call_id, 'call:' || p_call_id || ':minute:' || v_minute || ':spend'),
    (v_call.receiver_id, 'bean_credit', 'bean', v_credit, v_receiver_balance, p_call_id, 'call:' || p_call_id || ':minute:' || v_minute || ':earn');
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
  v_receiver uuid;
begin
  select receiver_id into v_receiver from public.calls where id = p_call_id and status = 'ringing' for update;
  if v_receiver is null or v_receiver <> (select auth.uid()) then raise exception 'CALL_NOT_FOUND' using errcode = 'P0001'; end if;
  if not p_accept then
    update public.calls set status = 'rejected', ended_at = now() where id = p_call_id;
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
begin
  update public.calls
  set status = 'ended', ended_at = now(),
      duration_seconds = greatest(0, coalesce(extract(epoch from now() - started_at)::integer, 0))
  where id = p_call_id and (select auth.uid()) in (caller_id, receiver_id) and status in ('ringing', 'ongoing');
end;
$$;

create or replace function public.report_user(p_reported_user uuid, p_room_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if p_reported_user = v_user or char_length(btrim(p_reason)) < 5 then raise exception 'INVALID_REPORT' using errcode = 'P0001'; end if;
  if p_room_id is not null and not exists (
    select 1 from public.chat_rooms where id = p_room_id and v_user in (user_a, user_b) and p_reported_user in (user_a, user_b)
  ) then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.reports (reporter_id, reported_user_id, room_id, reason)
  values (v_user, p_reported_user, p_room_id, btrim(p_reason)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_set_user_ban(p_target_user uuid, p_banned boolean, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_admin uuid := (select auth.uid());
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_target_user = v_admin then raise exception 'CANNOT_BAN_SELF' using errcode = 'P0001'; end if;
  if char_length(btrim(p_notes)) < 3 then raise exception 'NOTES_REQUIRED' using errcode = 'P0001'; end if;
  update public.users set is_banned = p_banned, status = case when p_banned then 'offline' else status end where id = p_target_user;
  insert into public.admin_actions (admin_id, action_type, target_user_id, notes)
  values (v_admin, case when p_banned then 'ban' else 'unban' end, p_target_user, btrim(p_notes));
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

create or replace function public.admin_review_report(p_report_id uuid, p_status text, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_report public.reports;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  update public.reports set status = p_status, admin_id = v_admin, admin_notes = p_notes,
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id returning * into v_report;
  if v_report.id is null then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.admin_actions (admin_id, action_type, target_user_id, target_room_id, notes)
  values (v_admin, 'resolve_report', v_report.reported_user_id, v_report.room_id, coalesce(nullif(btrim(p_notes), ''), 'Report status changed to ' || p_status));
end;
$$;

create or replace function public.admin_review_withdrawal(p_request_id uuid, p_approve boolean, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_request public.withdrawal_requests;
  v_balance numeric(14, 2);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select * into v_request from public.withdrawal_requests where id = p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' then raise exception 'WITHDRAWAL_NOT_PENDING' using errcode = 'P0001'; end if;
  if p_approve then
    update public.withdrawal_requests set status = 'paid', admin_id = v_admin, processed_at = now() where id = p_request_id;
    update public.wallets set lifetime_beans_withdrawn = lifetime_beans_withdrawn + v_request.beans_requested where user_id = v_request.user_id;
  else
    update public.wallets set beans_balance = beans_balance + v_request.beans_requested
    where user_id = v_request.user_id returning beans_balance into v_balance;
    update public.withdrawal_requests set status = 'rejected', admin_id = v_admin, processed_at = now() where id = p_request_id;
    insert into public.wallet_transactions (user_id, type, currency, amount, balance_after, idempotency_key)
    values (v_request.user_id, 'refund', 'bean', v_request.beans_requested, v_balance, 'withdrawal:' || p_request_id || ':refund');
  end if;
  insert into public.admin_actions (admin_id, action_type, target_user_id, notes)
  values (v_admin, case when p_approve then 'approve_withdrawal' else 'reject_withdrawal' end,
    v_request.user_id, coalesce(nullif(btrim(p_notes), ''), 'Withdrawal reviewed'));
end;
$$;

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_media enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.random_chat_queue enable row level security;
alter table public.reports enable row level security;
alter table public.admin_actions enable row level security;
alter table public.blocks enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.platform_config enable row level security;
alter table public.payment_intents enable row level security;
alter table public.withdrawal_requests enable row level security;

create policy users_anon_read on public.users for select to anon
using (not is_banned);
create policy users_authenticated_read on public.users for select to authenticated
using (not is_banned or id = (select auth.uid()) or public.is_admin());
create policy users_update_self on public.users for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy profile_media_public_read on public.profile_media for select to anon, authenticated using (true);
create policy profile_media_insert_self on public.profile_media for insert to authenticated
with check (user_id = (select auth.uid()));
create policy profile_media_update_self on public.profile_media for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profile_media_delete_self on public.profile_media for delete to authenticated
using (user_id = (select auth.uid()));

create policy wallets_read_own_or_admin on public.wallets for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy ledger_read_own_or_admin on public.wallet_transactions for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

create policy rooms_read_participant_or_admin on public.chat_rooms for select to authenticated
using ((select auth.uid()) in (user_a, user_b) or public.is_admin());
create policy messages_read_participant_or_admin on public.messages for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.chat_rooms r where r.id = messages.room_id and (select auth.uid()) in (r.user_a, r.user_b)
  )
);
create policy calls_read_participant_or_admin on public.calls for select to authenticated
using ((select auth.uid()) in (caller_id, receiver_id) or public.is_admin());
create policy queue_read_own on public.random_chat_queue for select to authenticated
using (user_id = (select auth.uid()));

create policy reports_read_own_or_admin on public.reports for select to authenticated
using (reporter_id = (select auth.uid()) or public.is_admin());
create policy admin_actions_admin_read on public.admin_actions for select to authenticated
using (public.is_admin());

create policy blocks_read_own on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()));
create policy blocks_insert_own on public.blocks for insert to authenticated
with check (blocker_id = (select auth.uid()));
create policy blocks_delete_own on public.blocks for delete to authenticated
using (blocker_id = (select auth.uid()));

create policy favorites_read_own on public.favorites for select to authenticated
using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites for insert to authenticated
with check (user_id = (select auth.uid()));
create policy favorites_delete_own on public.favorites for delete to authenticated
using (user_id = (select auth.uid()));

create policy ratings_public_read on public.ratings for select to anon, authenticated using (true);
create policy ratings_insert_participant on public.ratings for insert to authenticated
with check (
  rater_id = (select auth.uid()) and exists (
    select 1 from public.chat_rooms r
    where r.id = ratings.room_id and rater_id in (r.user_a, r.user_b) and rated_user_id in (r.user_a, r.user_b)
  )
);
create policy platform_config_public_read on public.platform_config for select to anon, authenticated using (true);
create policy payment_intents_read_own on public.payment_intents for select to authenticated
using (user_id = (select auth.uid()));
create policy withdrawals_read_own_or_admin on public.withdrawal_requests for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.users, public.profiles, public.profile_media, public.ratings, public.platform_config to anon;
grant select on all tables in schema public to authenticated;
grant update (display_name, gender, status, last_seen) on public.users to authenticated;
grant update (bio, age, location, languages, real_meet_available, free_chat_enabled, chat_rate_coins, audio_call_rate_coins, video_call_rate_coins, min_topup_required, tags) on public.profiles to authenticated;
grant insert, update, delete on public.profile_media to authenticated;
grant insert, delete on public.blocks, public.favorites to authenticated;
grant insert on public.ratings to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.create_or_get_direct_room(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, text, text) to authenticated;
grant execute on function public.mark_room_read(uuid) to authenticated;
grant execute on function public.create_payment_intent(numeric) to authenticated;
grant execute on function public.complete_dummy_payment(uuid) to authenticated;
grant execute on function public.request_withdrawal(numeric) to authenticated;
grant execute on function public.match_random_chat() to authenticated;
grant execute on function public.cancel_random_chat() to authenticated;
grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.charge_call_minute(uuid) to authenticated;
grant execute on function public.respond_to_call(uuid, boolean) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.report_user(uuid, uuid, text) to authenticated;
grant execute on function public.admin_set_user_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid, text, numeric, text) to authenticated;
grant execute on function public.admin_review_report(uuid, text, text) to authenticated;
grant execute on function public.admin_review_withdrawal(uuid, boolean, text) to authenticated;

alter table public.users replica identity full;
alter table public.profiles replica identity full;
alter table public.chat_rooms replica identity full;
alter table public.messages replica identity full;
alter table public.calls replica identity full;
alter table public.random_chat_queue replica identity full;

alter publication supabase_realtime add table
  public.users,
  public.profiles,
  public.chat_rooms,
  public.messages,
  public.calls,
  public.random_chat_queue;
