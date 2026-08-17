create table if not exists public.host_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  phone text not null check (char_length(phone) between 6 and 30),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_id uuid references public.users(id),
  admin_notes text check (char_length(admin_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists host_requests_status_created_idx on public.host_requests (status, created_at desc);
create index if not exists host_requests_user_created_idx on public.host_requests (user_id, created_at desc);
create index if not exists host_requests_admin_idx on public.host_requests (admin_id);
create unique index if not exists host_requests_one_pending_per_user_idx
  on public.host_requests (user_id) where status = 'pending';

alter table public.host_requests enable row level security;

drop policy if exists host_requests_read_own_or_admin on public.host_requests;
create policy host_requests_read_own_or_admin on public.host_requests for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (action_type in (
    'ban', 'unban', 'wallet_adjust', 'delete_message', 'close_room',
    'warn', 'resolve_report', 'approve_withdrawal', 'reject_withdrawal',
    'settings_update', 'verify_host', 'unverify_host',
    'host_request_approved', 'host_request_rejected'
  ));

create or replace function public.submit_host_request(
  p_phone text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_account public.users%rowtype;
  v_request_id uuid;
  v_phone text := btrim(coalesce(p_phone, ''));
  v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into v_account from public.users where id = v_user;

  if v_account.id is null or v_account.role <> 'user' or v_account.is_guest or v_account.gender <> 'female' then
    raise exception 'HOST_REQUEST_NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_account.is_banned then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if v_account.is_verified then raise exception 'ALREADY_FEATURED' using errcode = 'P0001'; end if;
  if char_length(v_phone) < 6 or char_length(v_phone) > 30 then
    raise exception 'PHONE_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.host_requests (user_id, phone, note)
  values (v_user, v_phone, v_note)
  on conflict (user_id) where status = 'pending'
  do update set phone = excluded.phone, note = excluded.note, updated_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.admin_review_host_request(
  p_request_id uuid,
  p_approve boolean,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_request public.host_requests%rowtype;
  v_notes text := left(btrim(coalesce(p_notes, '')), 1000);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;

  select * into v_request
  from public.host_requests
  where id = p_request_id
  for update;

  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'HOST_REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.host_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_id = v_admin,
      admin_notes = nullif(v_notes, ''),
      updated_at = now(),
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    update public.users
    set is_verified = true,
        updated_at = now()
    where id = v_request.user_id
      and role = 'user'
      and is_guest = false
      and gender = 'female';
  end if;

  insert into public.admin_actions (admin_id, action_type, target_user_id, notes)
  values (
    v_admin,
    case when p_approve then 'host_request_approved' else 'host_request_rejected' end,
    v_request.user_id,
    coalesce(nullif(v_notes, ''), case when p_approve then 'Host request approved' else 'Host request rejected' end)
  );
end;
$$;

revoke all on public.host_requests from anon, authenticated;
grant select on public.host_requests to authenticated;

revoke all on function public.submit_host_request(text, text) from public, anon, authenticated;
revoke all on function public.admin_review_host_request(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.submit_host_request(text, text) to authenticated;
grant execute on function public.admin_review_host_request(uuid, boolean, text) to authenticated;
