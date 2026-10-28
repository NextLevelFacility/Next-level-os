-- ============================================================
-- NEXT LEVEL OS — Phase 6: pre-registered team (roles applied at sign-up)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  role text not null default 'newhire',
  roles text[] not null default '{}',
  title text,
  location_id uuid references locations(id),
  claimed_by uuid references profiles(id),
  claimed_at timestamptz,
  created_at timestamptz default now()
);
alter table team_invites enable row level security;
drop policy if exists "invites managers" on team_invites;
create policy "invites managers" on team_invites for all to authenticated using (is_manager()) with check (is_manager());

-- When someone signs up, match them to a pre-registered teammate by email, else by name, and apply the roles.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  miami uuid;
  inv team_invites%rowtype;
  nm text;
begin
  select count(*) into n from profiles;
  select id into miami from locations where slug = 'miami';
  nm := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  insert into profiles (id, email, full_name, role, location_id)
  values (new.id, new.email, nm, case when n = 0 then 'owner' else 'newhire' end, miami);

  select * into inv from team_invites
   where claimed_by is null
     and (lower(email) = lower(new.email) or (email is null and lower(full_name) = lower(nm)))
   order by (lower(email) = lower(new.email)) desc nulls last
   limit 1;
  if found then
    update profiles set role = inv.role, roles = inv.roles, title = inv.title, location_id = coalesce(inv.location_id, miami) where id = new.id;
    update team_invites set claimed_by = new.id, claimed_at = now() where id = inv.id;
  end if;
  return new;
end $$;

insert into team_invites (full_name, role, roles, title, location_id)
select v.full_name, v.role, v.roles, v.title, (select id from locations where slug = 'miami')
from (values
  ('Abe',      'coach',     array['sales'],    'Coach · Sales'),
  ('Vittorio', 'coach',     array['sales'],    'Coach · Sales'),
  ('Simon',    'coach',     array['director'], 'Coach · Director of Method'),
  ('Dylan',    'frontdesk', array[]::text[],   'Concession'),
  ('Tomas',    'frontdesk', array[]::text[],   'Concession')
) as v(full_name, role, roles, title)
where not exists (select 1 from team_invites t where lower(t.full_name) = lower(v.full_name));

select full_name, role, roles, title from team_invites order by created_at;
