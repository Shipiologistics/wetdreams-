create table if not exists public.visitor_sessions (
  session_id text primary key check (char_length(session_id) between 16 and 120),
  user_id uuid references public.users(id) on delete set null,
  device_hash text check (device_hash is null or device_hash ~ '^[a-f0-9]{64}$'),
  path text not null default '/' check (char_length(path) <= 250),
  user_agent text check (char_length(user_agent) <= 500),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists visitor_sessions_last_seen_idx
  on public.visitor_sessions (last_seen_at desc);
create index if not exists visitor_sessions_user_recent_idx
  on public.visitor_sessions (user_id, last_seen_at desc);

alter table public.visitor_sessions enable row level security;

drop policy if exists visitor_sessions_admin_read on public.visitor_sessions;
create policy visitor_sessions_admin_read on public.visitor_sessions for select to authenticated
using (public.is_admin());

create or replace function public.track_visitor_session(
  p_session_id text,
  p_device_id text default null,
  p_path text default '/',
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_device_hash text := public.hash_device_id(p_device_id);
  v_path text := left(coalesce(nullif(btrim(p_path), ''), '/'), 250);
  v_user_agent text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 500);
begin
  if p_session_id is null or char_length(p_session_id) < 16 or char_length(p_session_id) > 120 then
    raise exception 'INVALID_VISITOR_SESSION' using errcode = 'P0001';
  end if;

  insert into public.visitor_sessions (session_id, user_id, device_hash, path, user_agent)
  values (p_session_id, v_user, v_device_hash, v_path, v_user_agent)
  on conflict (session_id) do update
  set user_id = coalesce(excluded.user_id, public.visitor_sessions.user_id),
      device_hash = coalesce(excluded.device_hash, public.visitor_sessions.device_hash),
      path = excluded.path,
      user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
      last_seen_at = now();

  return true;
end;
$$;

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (action_type in (
    'ban', 'unban', 'wallet_adjust', 'delete_message', 'close_room',
    'warn', 'resolve_report', 'approve_withdrawal', 'reject_withdrawal',
    'settings_update'
  ));

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

revoke all on public.visitor_sessions from anon, authenticated;
grant select on public.visitor_sessions to authenticated;

revoke all on function public.track_visitor_session(text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_platform_config(text, numeric, text) from public, anon, authenticated;
grant execute on function public.track_visitor_session(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_platform_config(text, numeric, text) to authenticated;
