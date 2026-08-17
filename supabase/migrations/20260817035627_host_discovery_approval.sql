alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (action_type in (
    'ban', 'unban', 'wallet_adjust', 'delete_message', 'close_room',
    'warn', 'resolve_report', 'approve_withdrawal', 'reject_withdrawal',
    'settings_update', 'verify_host', 'unverify_host'
  ));

create or replace function public.admin_set_user_verification(
  p_target_user uuid,
  p_verified boolean,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_target public.users%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;

  update public.users
  set is_verified = p_verified,
      updated_at = now()
  where id = p_target_user
    and role = 'user'
    and is_guest = false
  returning * into v_target;

  if v_target.id is null then
    raise exception 'HOST_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.admin_actions (admin_id, action_type, target_user_id, notes)
  values (
    v_admin,
    case when p_verified then 'verify_host' else 'unverify_host' end,
    p_target_user,
    coalesce(nullif(btrim(p_notes), ''), case when p_verified then 'Host approved for discovery' else 'Host hidden from discovery' end)
  );
end;
$$;

revoke all on function public.admin_set_user_verification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_verification(uuid, boolean, text) to authenticated;
