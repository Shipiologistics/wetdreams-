create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type text not null check (type in ('message', 'call', 'tip', 'wallet', 'system')),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 280),
  href text not null default '/notifications' check (char_length(href) <= 240),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id, read_at)
  where read_at is null;

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_read_own_or_admin on public.app_notifications;
create policy app_notifications_read_own_or_admin on public.app_notifications for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists app_notifications_update_own_read_state on public.app_notifications;
create policy app_notifications_update_own_read_state on public.app_notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chat_rooms%rowtype;
  v_sender_name text;
  v_target uuid;
  v_body text;
begin
  select * into v_room from public.chat_rooms where id = new.room_id;
  if v_room.id is null or v_room.room_type = 'random' then return new; end if;

  v_target := case when new.sender_id = v_room.user_a then v_room.user_b else v_room.user_a end;
  if v_target is null or v_target = new.sender_id then return new; end if;

  select display_name into v_sender_name from public.users where id = new.sender_id;
  v_body := case
    when new.message_type = 'text' then left(coalesce(new.content, 'New message'), 160)
    when new.message_type = 'emoji' then coalesce(new.content, 'Sent an emoji')
    when new.message_type = 'image' then 'Sent a photo'
    when new.message_type = 'video' then 'Sent a video'
    else 'New message'
  end;

  insert into public.app_notifications (user_id, actor_id, type, title, body, href, metadata)
  values (
    v_target,
    new.sender_id,
    'message',
    coalesce(v_sender_name, 'New message'),
    v_body,
    '/chat/' || new.room_id,
    jsonb_build_object('room_id', new.room_id, 'message_id', new.id)
  );

  return new;
end;
$$;

create or replace function public.notify_call_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_name text;
begin
  if new.status <> 'ringing' then return new; end if;

  select display_name into v_caller_name from public.users where id = new.caller_id;

  insert into public.app_notifications (user_id, actor_id, type, title, body, href, metadata)
  values (
    new.receiver_id,
    new.caller_id,
    'call',
    case when new.call_type = 'video' then 'Incoming video call' else 'Incoming voice call' end,
    coalesce(v_caller_name, 'Someone') || ' is calling you',
    '/chat/' || new.room_id,
    jsonb_build_object('room_id', new.room_id, 'call_id', new.id, 'call_type', new.call_type)
  );

  return new;
end;
$$;

create or replace function public.notify_tip_earn_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'tip_earn' then return new; end if;

  insert into public.app_notifications (user_id, type, title, body, href, metadata)
  values (
    new.user_id,
    'tip',
    'Gift received',
    'You received ' || trim(to_char(new.amount, 'FM999999990.00')) || ' beans',
    coalesce('/chat/' || new.related_chat_id::text, '/wallet'),
    jsonb_build_object('transaction_id', new.id, 'chat_id', new.related_chat_id, 'call_id', new.related_call_id)
  );

  return new;
end;
$$;

drop trigger if exists app_notifications_after_message_insert on public.messages;
create trigger app_notifications_after_message_insert
after insert on public.messages
for each row execute function public.notify_message_insert();

drop trigger if exists app_notifications_after_call_insert on public.calls;
create trigger app_notifications_after_call_insert
after insert on public.calls
for each row execute function public.notify_call_insert();

drop trigger if exists app_notifications_after_wallet_transaction_insert on public.wallet_transactions;
create trigger app_notifications_after_wallet_transaction_insert
after insert on public.wallet_transactions
for each row execute function public.notify_tip_earn_insert();

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  update public.app_notifications
  set read_at = now()
  where user_id = v_user
    and read_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on public.app_notifications from anon, authenticated;
grant select on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;

revoke all on function public.notify_message_insert() from public, anon, authenticated;
revoke all on function public.notify_call_insert() from public, anon, authenticated;
revoke all on function public.notify_tip_earn_insert() from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

alter table public.app_notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;
