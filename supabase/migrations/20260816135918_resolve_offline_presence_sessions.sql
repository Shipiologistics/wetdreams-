create or replace function public.track_visitor_session(
  p_session_id text,
  p_device_id text default null,
  p_path text default '/',
  p_user_agent text default null,
  p_presence text default 'online'
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
  v_presence text := coalesce(nullif(btrim(p_presence), ''), 'online');
begin
  if p_session_id is null or char_length(p_session_id) < 16 or char_length(p_session_id) > 120 then
    raise exception 'INVALID_VISITOR_SESSION' using errcode = 'P0001';
  end if;
  if v_presence not in ('online', 'offline') then
    raise exception 'INVALID_PRESENCE' using errcode = 'P0001';
  end if;

  perform public.refresh_stale_presence();

  insert into public.visitor_sessions (session_id, user_id, device_hash, path, user_agent, presence)
  values (p_session_id, v_user, v_device_hash, v_path, v_user_agent, v_presence)
  on conflict (session_id) do update
  set user_id = coalesce(excluded.user_id, public.visitor_sessions.user_id),
      device_hash = coalesce(excluded.device_hash, public.visitor_sessions.device_hash),
      path = excluded.path,
      user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
      presence = v_presence,
      last_seen_at = case when v_presence = 'online' then now() else public.visitor_sessions.last_seen_at end;

  if v_user is not null then
    if v_presence = 'online' then
      update public.users
      set last_seen = now(),
          status = public.resolve_user_presence(v_user),
          updated_at = now()
      where id = v_user;
    elsif not exists (
      select 1
      from public.calls c
      where c.status in ('ringing', 'ongoing')
        and v_user in (c.caller_id, c.receiver_id)
    ) then
      update public.users
      set status = public.resolve_user_presence(v_user),
          updated_at = now()
      where id = v_user;
    end if;
  end if;

  return true;
end;
$$;
