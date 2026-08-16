create schema if not exists app_private;

create table if not exists app_private.maintenance_secrets (
  name text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema app_private from public, anon, authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;

alter table public.messages
  add column if not exists cloudinary_public_id text,
  add column if not exists cloudinary_resource_type text,
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');

alter table public.messages
  drop constraint if exists messages_media_cloudinary_identity_chk,
  add constraint messages_media_cloudinary_identity_chk check (
    message_type not in ('image', 'video')
    or (
      cloudinary_url is not null
      and cloudinary_public_id is not null
      and cloudinary_resource_type in ('image', 'video', 'raw')
    )
  );

create index if not exists messages_expires_at_idx on public.messages (expires_at);
create index if not exists messages_expired_media_idx
  on public.messages (expires_at, cloudinary_resource_type)
  where cloudinary_public_id is not null;

create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.related_message_id is not null
    and new.related_message_id is null
    and (to_jsonb(old) - 'related_message_id') = (to_jsonb(new) - 'related_message_id')
  then
    return new;
  end if;

  raise exception 'WALLET_LEDGER_IS_IMMUTABLE' using errcode = 'P0001';
end;
$$;

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_related_message_id_fkey;
alter table public.wallet_transactions
  add constraint wallet_transactions_related_message_id_fkey
  foreign key (related_message_id) references public.messages(id) on delete set null;

drop function if exists public.send_message(uuid, text, text, text);

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

create or replace function app_private.has_maintenance_secret(p_name text, p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.maintenance_secrets
    where name = p_name
      and secret_hash = extensions.crypt(coalesce(p_secret, ''), secret_hash)
  );
$$;

create or replace function public.get_expired_chat_messages_for_cleanup(
  p_secret text,
  p_limit integer default 500
)
returns table (
  id uuid,
  room_id uuid,
  cloudinary_public_id text,
  cloudinary_resource_type text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.has_maintenance_secret('chat_cleanup', p_secret) then
    raise exception 'MAINTENANCE_SECRET_INVALID' using errcode = 'P0001';
  end if;

  return query
  select m.id, m.room_id, m.cloudinary_public_id, m.cloudinary_resource_type
  from public.messages m
  where m.expires_at <= now()
  order by m.expires_at, m.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

create or replace function public.delete_expired_chat_messages(
  p_secret text,
  p_message_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_room_ids uuid[] := '{}';
begin
  if not app_private.has_maintenance_secret('chat_cleanup', p_secret) then
    raise exception 'MAINTENANCE_SECRET_INVALID' using errcode = 'P0001';
  end if;

  with deleted as (
    delete from public.messages m
    where m.id = any(coalesce(p_message_ids, '{}'::uuid[]))
      and m.expires_at <= now()
    returning m.room_id
  )
  select count(*)::integer, coalesce(array_agg(distinct room_id), '{}'::uuid[])
  into v_deleted, v_room_ids
  from deleted;

  if v_deleted > 0 then
    update public.chat_rooms r
    set message_count = stats.message_count,
        last_message_at = coalesce(stats.last_message_at, r.created_at),
        is_paywalled = coalesce(stats.is_paywalled, false)
    from (
      select
        affected.room_id,
        count(m.id)::integer as message_count,
        max(m.created_at) as last_message_at,
        bool_or(m.is_paid) as is_paywalled
      from unnest(v_room_ids) affected(room_id)
      left join public.messages m on m.room_id = affected.room_id
      group by affected.room_id
    ) stats
    where r.id = stats.room_id;
  end if;

  return v_deleted;
end;
$$;

revoke all on function app_private.has_maintenance_secret(text, text) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.get_expired_chat_messages_for_cleanup(text, integer) from public;
revoke all on function public.delete_expired_chat_messages(text, uuid[]) from public;

grant execute on function public.send_message(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.get_expired_chat_messages_for_cleanup(text, integer) to anon, authenticated;
grant execute on function public.delete_expired_chat_messages(text, uuid[]) to anon, authenticated;
