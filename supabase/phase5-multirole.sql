-- ============================================================
-- NEXT LEVEL OS — Phase 5: people with more than one role
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
alter table profiles add column if not exists roles text[] not null default '{}';   -- extra roles beside the primary one

create or replace function my_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_append(roles, role), array[role]) from profiles where id = auth.uid()
$$;
create or replace function is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_roles() && array['owner','operator','director'], false)
$$;
create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_roles() && array['owner','operator','director','coach'], false)
$$;

-- Only managers may change roles (primary or extra)
create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.location_id is distinct from old.location_id or new.roles is distinct from old.roles
      or new.pay_hourly is distinct from old.pay_hourly or new.pay_per_session is distinct from old.pay_per_session)
     and not is_manager() then
    raise exception 'Only an Owner or Operator can change role, location or pay';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_fields on profiles;
create trigger protect_profile_fields before update on profiles
  for each row execute function protect_profile_fields();

select 'phase 5 ok' as result;
