create or replace function public.enforce_guest_male_gender()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_guest then
    new.gender := 'male';
  end if;
  return new;
end;
$$;

drop trigger if exists users_enforce_guest_male_gender on public.users;
create trigger users_enforce_guest_male_gender
before insert or update of is_guest, gender on public.users
for each row execute function public.enforce_guest_male_gender();

revoke all on function public.enforce_guest_male_gender() from public, anon, authenticated;
