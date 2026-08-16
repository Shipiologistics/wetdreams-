alter table public.users
  add column if not exists is_guest boolean not null default false;

update public.users u
set is_guest = coalesce(au.is_anonymous, false)
from auth.users au
where au.id = u.id;

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
  v_gender text;
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
  v_display_name := left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Guest'), 60);
  v_gender := case
    when new.raw_user_meta_data ->> 'gender' in ('male', 'female', 'other') then new.raw_user_meta_data ->> 'gender'
    else 'male'
  end;

  insert into public.users (id, username, display_name, gender, is_guest)
  values (new.id, v_username, v_display_name, v_gender, coalesce(new.is_anonymous, false));
  insert into public.profiles (user_id) values (new.id);
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create or replace function public.sync_user_guest_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set is_guest = coalesce(new.is_anonymous, false)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_user_guest_status_on_auth_update on auth.users;
create trigger sync_user_guest_status_on_auth_update
after update of is_anonymous on auth.users
for each row
when (old.is_anonymous is distinct from new.is_anonymous)
execute function public.sync_user_guest_status();
