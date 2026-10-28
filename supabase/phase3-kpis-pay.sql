-- ============================================================
-- NEXT LEVEL OS — Phase 3: daily goals (KPIs), pay rates, shift checklist
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- Pay rates (set by Owner/Operator on the Team page)
alter table profiles add column if not exists pay_hourly numeric;
alter table profiles add column if not exists pay_per_session numeric;
alter table profiles add column if not exists title text;

-- Daily goals per role. kind: count (number toward a goal) | check (yes/no)
create table if not exists kpi_goals (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  metric text not null,
  label text not null,
  kind text not null default 'count',
  goal numeric not null default 1,
  stretch numeric,
  step int default 1,            -- the +N button size
  sort int default 0,
  active boolean default true,
  unique (role, metric)
);
alter table kpi_goals enable row level security;
drop policy if exists "goals read" on kpi_goals;
create policy "goals read" on kpi_goals for select to authenticated using (true);
drop policy if exists "goals write" on kpi_goals;
create policy "goals write" on kpi_goals for all to authenticated using (is_manager()) with check (is_manager());

insert into kpi_goals (role, metric, label, kind, goal, stretch, step, sort) values
  ('sales', 'calls', 'Calls made', 'count', 100, null, 10, 1),
  ('sales', 'meetings', 'Meetings booked', 'count', 3, 5, 1, 2),
  ('sales', 'closes', 'Closes', 'count', 2, null, 1, 3),
  ('frontdesk', 'videos', 'Videos recorded', 'count', 2, 3, 1, 1),
  ('frontdesk', 'gym_clean', 'Gym cleaned', 'check', 1, null, 1, 2),
  ('frontdesk', 'rentals', 'Rentals / parties handled', 'count', 1, null, 1, 3),
  ('coach', 'sessions', 'Sessions logged', 'count', 3, 5, 1, 1),
  ('coach', 'notes', 'Every player got notes', 'check', 1, null, 1, 2),
  ('director', 'sessions', 'Sessions logged', 'count', 2, null, 1, 1),
  ('director', 'reports', 'Reports reviewed', 'count', 1, 3, 1, 2),
  ('operator', 'checklists', 'All checklists checked', 'check', 1, null, 1, 1),
  ('operator', 'reports', 'Staff reports reviewed', 'check', 1, null, 1, 2),
  ('owner', 'dashboard', 'CEO dashboard reviewed', 'check', 1, null, 1, 1)
on conflict (role, metric) do nothing;

-- Each person's numbers for each day
create table if not exists kpi_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  location_id uuid references locations(id),
  kpi_date date not null default current_date,
  data jsonb not null default '{}',   -- {"calls": 40, "meetings": 2, "closes": 1, "gym_clean": 1}
  updated_at timestamptz default now(),
  unique (user_id, kpi_date)
);
alter table kpi_days enable row level security;
drop policy if exists "kpi own" on kpi_days;
create policy "kpi own" on kpi_days for all to authenticated
  using (user_id = auth.uid() or (is_manager() and sees_location(location_id)))
  with check (user_id = auth.uid());

-- Concession / front desk evening shift checklist
insert into checklist_templates (name, slot, role, items)
select 'Concession shift · 4pm–12am', 'shift', 'frontdesk', '[
  {"text":"Clocked in by 4:00pm (Today screen)"},
  {"text":"Concession stocked: drinks, snacks, ice; fridge temp logged"},
  {"text":"Square register open, float counted"},
  {"text":"Walk the gym: equipment reset, trash cleared", "photo":true},
  {"text":"Record video #1 for Instagram (session, drill or testimonial)"},
  {"text":"Record video #2 for Instagram"},
  {"text":"Greet every rental and birthday party on arrival; confirm end time"},
  {"text":"8pm walkthrough: bathrooms stocked, floors clear"},
  {"text":"Close concession: cash counted, Square day closed"},
  {"text":"Gym cleaned: turf swept, equipment back, trash out", "photo":true},
  {"text":"Lights off, doors locked, alarm set; clock out"}
]'::jsonb
where not exists (select 1 from checklist_templates where name like 'Concession shift%');

-- Managers can read everyone's time entries at their location (already in "time own"), owner all.
select 'phase 3 ok' as result;
