alter table public.users
  alter column gender set default 'male';

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

  insert into public.users (id, username, display_name, gender)
  values (new.id, v_username, v_display_name, v_gender);
  insert into public.profiles (user_id) values (new.id);
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;
