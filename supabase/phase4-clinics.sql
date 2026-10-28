-- ============================================================
-- NEXT LEVEL OS — Phase 4: clinics / events board
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  name text not null,
  kind text default 'clinic',          -- clinic | camp | combine | tournament
  starts_on date,
  ends_on date,
  capacity int,
  price numeric,
  push_from date,                      -- when the team starts pushing it
  push_until date,
  keyword text,                        -- matches Square item names, e.g. 'Thanksgiving'
  goal_signups int,
  notes text,
  active boolean default true,
  sort int default 0,
  created_at timestamptz default now()
);
create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  athlete_name text not null,
  parent_name text,
  phone text,
  email text,
  amount numeric,
  source text default 'manual',        -- manual | square | stripe | ghl
  external_id text unique,             -- Square payment id, so imports never double count
  paid boolean default true,
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists event_regs_event_idx on event_registrations(event_id);
alter table events enable row level security;
alter table event_registrations enable row level security;
drop policy if exists "events read" on events;
create policy "events read" on events for select to authenticated using (true);
drop policy if exists "events write" on events;
create policy "events write" on events for all to authenticated using (is_manager()) with check (is_manager());
drop policy if exists "regs read" on event_registrations;
create policy "regs read" on event_registrations for select to authenticated using (true);
drop policy if exists "regs write" on event_registrations;
create policy "regs write" on event_registrations for insert to authenticated with check (true);
drop policy if exists "regs manage" on event_registrations;
create policy "regs manage" on event_registrations for update to authenticated using (is_manager() or added_by = auth.uid());
drop policy if exists "regs delete" on event_registrations;
create policy "regs delete" on event_registrations for delete to authenticated using (is_manager());

insert into events (name, kind, starts_on, ends_on, capacity, push_from, push_until, keyword, goal_signups, sort)
select * from (values
  ('Thanksgiving Clinic', 'clinic', date '2026-11-23', date '2026-11-27', 60, date '2026-10-15', date '2026-11-22', 'Thanksgiving', 50, 1),
  ('Winter Clinic',       'clinic', date '2026-12-21', date '2026-12-30', 60, date '2026-11-28', date '2026-12-20', 'Winter',       50, 2),
  ('Spring Clinic',       'clinic', date '2027-03-22', date '2027-03-26', 60, date '2027-02-01', date '2027-03-21', 'Spring',       50, 3),
  ('Summer Camp · Blueprint X', 'camp', date '2027-06-07', date '2027-08-06', 120, date '2027-04-01', date '2027-06-06', 'Summer', 100, 4)
) as v(name, kind, starts_on, ends_on, capacity, push_from, push_until, keyword, goal_signups, sort)
where not exists (select 1 from events);

select 'phase 4 ok' as result;
