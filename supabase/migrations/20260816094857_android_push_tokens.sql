create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 20 and 500),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android')),
  device_hash text check (device_hash is null or device_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user_recent_idx
  on public.push_tokens (user_id, last_seen_at desc);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_read_own_or_admin on public.push_tokens;
create policy push_tokens_read_own_or_admin on public.push_tokens for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.register_push_token(
  p_token text,
  p_device_id text default null,
  p_platform text default 'android'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text := btrim(coalesce(p_token, ''));
  v_device_hash text := public.hash_device_id(p_device_id);
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(v_token) < 20 or char_length(v_token) > 500 then raise exception 'INVALID_PUSH_TOKEN' using errcode = 'P0001'; end if;
  if p_platform <> 'android' then raise exception 'INVALID_PUSH_PLATFORM' using errcode = 'P0001'; end if;

  insert into public.push_tokens (token, user_id, platform, device_hash, enabled)
  values (v_token, v_user, p_platform, v_device_hash, true)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      device_hash = excluded.device_hash,
      enabled = true,
      last_seen_at = now();

  return true;
end;
$$;

revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

revoke all on function public.register_push_token(text, text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text, text) to authenticated;
