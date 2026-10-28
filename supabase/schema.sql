-- ============================================================
-- NEXT LEVEL OS — Phase 1 schema
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: everything is "if not exists".
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Locations ----------
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  address text,
  active boolean default true,
  created_at timestamptz default now()
);

insert into locations (slug, name, address) values
  ('miami', 'Miami HQ', '13450 SW 129th St, Miami, FL'),
  ('ocala', 'Ocala', null),
  ('suly', 'Suly Location', null)
on conflict (slug) do nothing;

-- ---------- Profiles (one per login) ----------
-- role: owner | operator | coach | sales | frontdesk | newhire
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'newhire',
  location_id uuid references locations(id),
  phone text,
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);

-- Auto-create a profile when someone signs up.
-- First user ever becomes owner at Miami; everyone else starts as newhire.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  miami uuid;
begin
  select count(*) into n from profiles;
  select id into miami from locations where slug = 'miami';
  insert into profiles (id, email, full_name, role, location_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when n = 0 then 'owner' else 'newhire' end,
    miami
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- SOP reads (who has read what) ----------
create table if not exists sop_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  sop_path text not null,
  read_at timestamptz default now(),
  unique (user_id, sop_path)
);

-- ---------- Checklists ----------
create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),   -- null = every location
  name text not null,
  slot text not null default 'daily',           -- opening | closing | daily | event
  role text,                                    -- who it's for (null = anyone)
  items jsonb not null default '[]',            -- [{"text":"...", "photo":false}]
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists checklist_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references checklist_templates(id) on delete cascade,
  location_id uuid references locations(id),
  user_id uuid references profiles(id),
  run_date date not null default current_date,
  completed jsonb not null default '{}',        -- {"0": {"at": "...", "photo": "url"}}
  done boolean default false,
  created_at timestamptz default now(),
  unique (template_id, location_id, run_date)
);

insert into checklist_templates (name, slot, role, items)
select 'Opening', 'opening', 'frontdesk', '[
  {"text":"Unlock, lights on, music on"},
  {"text":"Walk the turf: no debris, goals secured", "photo":true},
  {"text":"Front desk tablet on, PushPress check-in open"},
  {"text":"Concession stocked and fridge temp logged"},
  {"text":"Bathrooms checked and stocked"},
  {"text":"Today''s rentals and parties reviewed on the calendar"}
]'::jsonb
where not exists (select 1 from checklist_templates where name = 'Opening');

insert into checklist_templates (name, slot, role, items)
select 'Closing', 'closing', 'frontdesk', '[
  {"text":"All equipment back in place", "photo":true},
  {"text":"Turf swept, trash out"},
  {"text":"Concession closed out, cash counted"},
  {"text":"Square and PushPress day closed"},
  {"text":"Lights off, doors locked, alarm set"}
]'::jsonb
where not exists (select 1 from checklist_templates where name = 'Closing');

insert into checklist_templates (name, slot, role, items)
select 'Coach session standard', 'daily', 'coach', '[
  {"text":"Session plan reviewed before athletes arrive"},
  {"text":"Every athlete greeted by name"},
  {"text":"Every session logged in the ADP"},
  {"text":"Equipment reset for the next group"}
]'::jsonb
where not exists (select 1 from checklist_templates where name = 'Coach session standard');

-- ---------- Onboarding (the 5 C's + 30-day plan) ----------
create table if not exists hires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  location_id uuid references locations(id),
  full_name text not null,
  role text not null,
  start_date date,
  buddy_id uuid references profiles(id),
  manager_id uuid references profiles(id),
  problems jsonb default '["","",""]',          -- the three problems they're hired to solve
  status text default 'pre-start',              -- pre-start | week1 | week2 | week3 | week4 | day60 | day90 | complete
  created_at timestamptz default now()
);

create table if not exists onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  hire_id uuid references hires(id) on delete cascade,
  phase text not null,          -- compliance | week1 | week2 | week3 | week4 | day60 | day90
  c text not null,              -- compliance | clarity | culture | connection | checkback
  text text not null,
  owner text default 'hire',    -- hire | manager | operator | buddy | owner
  done boolean default false,
  done_at timestamptz,
  sort int default 0
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  hire_id uuid references hires(id) on delete cascade,
  by_user uuid references profiles(id),
  note text,
  needed text,                  -- "What did you need today that you didn't have?"
  created_at timestamptz default now()
);

-- ---------- Reports (staff fill in from their phone) ----------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  user_id uuid references profiles(id),
  kind text not null,           -- shift | session | sales | incident
  report_date date default current_date,
  data jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table locations enable row level security;
alter table sop_reads enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_runs enable row level security;
alter table hires enable row level security;
alter table onboarding_tasks enable row level security;
alter table checkins enable row level security;
alter table reports enable row level security;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
create or replace function my_location() returns uuid
language sql stable security definer set search_path = public as $$
  select location_id from profiles where id = auth.uid()
$$;
create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','operator') from profiles where id = auth.uid()), false)
$$;

-- Everyone signed in can read locations and all profiles (the team page)
drop policy if exists "read locations" on locations;
create policy "read locations" on locations for select to authenticated using (true);
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated using (true);
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid());
drop policy if exists "managers update profiles" on profiles;
create policy "managers update profiles" on profiles for update to authenticated using (is_manager());

-- SOP reads: see own; managers see all
drop policy if exists "own sop reads" on sop_reads;
create policy "own sop reads" on sop_reads for all to authenticated
  using (user_id = auth.uid() or is_manager()) with check (user_id = auth.uid());

-- Checklists
drop policy if exists "read templates" on checklist_templates;
create policy "read templates" on checklist_templates for select to authenticated using (true);
drop policy if exists "managers edit templates" on checklist_templates;
create policy "managers edit templates" on checklist_templates for all to authenticated using (is_manager());
drop policy if exists "runs at my location" on checklist_runs;
create policy "runs at my location" on checklist_runs for all to authenticated
  using (location_id = my_location() or my_role() = 'owner')
  with check (location_id = my_location() or my_role() = 'owner');

-- Onboarding: the hire sees their own; managers see their location; owner sees all
drop policy if exists "hires visibility" on hires;
create policy "hires visibility" on hires for select to authenticated
  using (user_id = auth.uid() or buddy_id = auth.uid() or manager_id = auth.uid()
         or (is_manager() and (location_id = my_location() or my_role() = 'owner')));
drop policy if exists "managers manage hires" on hires;
create policy "managers manage hires" on hires for all to authenticated using (is_manager());
drop policy if exists "tasks visibility" on onboarding_tasks;
create policy "tasks visibility" on onboarding_tasks for all to authenticated
  using (exists (select 1 from hires h where h.id = hire_id and
          (h.user_id = auth.uid() or h.buddy_id = auth.uid() or h.manager_id = auth.uid() or is_manager())));
drop policy if exists "checkins visibility" on checkins;
create policy "checkins visibility" on checkins for all to authenticated
  using (exists (select 1 from hires h where h.id = hire_id and
          (h.user_id = auth.uid() or h.manager_id = auth.uid() or is_manager())));

-- Reports: write own, read own or managers at location, owner all
drop policy if exists "reports insert" on reports;
create policy "reports insert" on reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reports read" on reports;
create policy "reports read" on reports for select to authenticated
  using (user_id = auth.uid() or my_role() = 'owner' or (is_manager() and location_id = my_location()));

-- Only an owner/operator may change someone's role or location (a hire can't promote themselves)
create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.location_id is distinct from old.location_id)
     and not is_manager() then
    raise exception 'Only an Owner or Operator can change role or location';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_fields on profiles;
create trigger protect_profile_fields before update on profiles
  for each row execute function protect_profile_fields();

-- ---------- Photo storage for checklists ----------
insert into storage.buckets (id, name, public) values ('checklist-photos', 'checklist-photos', true)
on conflict (id) do nothing;
do $$
begin
  execute 'drop policy if exists "upload checklist photos" on storage.objects';
  execute 'create policy "upload checklist photos" on storage.objects for insert to authenticated with check (bucket_id = ''checklist-photos'')';
  execute 'drop policy if exists "read checklist photos" on storage.objects';
  execute 'create policy "read checklist photos" on storage.objects for select to public using (bucket_id = ''checklist-photos'')';
exception when others then
  raise notice 'Storage policies skipped (%). Set them in Storage → checklist-photos → Policies.', sqlerrm;
end $$;
