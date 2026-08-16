create table if not exists public.guest_devices (
  device_hash text primary key check (device_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid unique not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.guest_devices enable row level security;

create policy guest_devices_admin_read on public.guest_devices for select to authenticated
using (public.is_admin());

revoke all on public.guest_devices from anon, authenticated;
grant select on public.guest_devices to authenticated;
