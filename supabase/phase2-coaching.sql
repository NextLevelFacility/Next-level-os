-- ============================================================
-- NEXT LEVEL OS — Phase 2: time clock, athletes, sessions,
-- player development reports, methodology modules, AI chat log
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- Directors (Simon, Vittorio) can edit the Method and approve reports
-- role: owner | operator | director | coach | sales | frontdesk | newhire

create or replace function is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','operator','director') from profiles where id = auth.uid()), false)
$$;
create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','operator','director','coach') from profiles where id = auth.uid()), false)
$$;
create or replace function sees_location(loc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select loc is null or loc = (select location_id from profiles where id = auth.uid())
         or (select role from profiles where id = auth.uid()) = 'owner'
$$;

-- ---------- Time clock ----------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  location_id uuid references locations(id),
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  created_at timestamptz default now()
);
create index if not exists time_entries_user_idx on time_entries(user_id, clock_in desc);
alter table time_entries enable row level security;
drop policy if exists "time own" on time_entries;
create policy "time own" on time_entries for all to authenticated
  using (user_id = auth.uid() or (is_manager() and sees_location(location_id)))
  with check (user_id = auth.uid() or is_manager());

-- ---------- Athletes ----------
create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  full_name text not null,
  age int,
  dob date,
  position text,                -- full name, e.g. Defensive Midfielder
  position_short text,          -- e.g. CDM
  program text,                 -- Semi-Private Technique, Speed & Performance, Homeschool, Blueprint X...
  frequency int,                -- sessions per week
  joined_on date,
  club text,
  dominant_foot text,
  parent_name text,
  parent_phone text,
  parent_email text,
  notes text,
  active boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table athletes enable row level security;
drop policy if exists "athletes read" on athletes;
create policy "athletes read" on athletes for select to authenticated using (sees_location(location_id));
drop policy if exists "athletes write" on athletes;
create policy "athletes write" on athletes for all to authenticated
  using (is_coach() and sees_location(location_id)) with check (is_coach());

-- ---------- Sessions ----------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  coach_id uuid references profiles(id),
  coaches text,                 -- "Lucas · Simon · Felipe"
  session_date date not null default current_date,
  start_time time,
  duration_min int default 60,
  session_type text,            -- Semi-Private Technique, Speed & Performance, Private 1-on-1, Group, Blueprint X, Evaluation
  focus text[] default '{}',    -- focus areas worked (pills)
  worked_on text,               -- what we worked on
  notes text,
  created_at timestamptz default now()
);
create table if not exists session_athletes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,
  present boolean default true,
  confidence int check (confidence between 1 and 10),
  technical int check (technical between 1 and 10),
  effort int check (effort between 1 and 10),
  improvements text,            -- what improved today
  weaknesses text,              -- what to work on
  unique (session_id, athlete_id)
);
create index if not exists session_athletes_athlete_idx on session_athletes(athlete_id);
alter table sessions enable row level security;
alter table session_athletes enable row level security;
drop policy if exists "sessions read" on sessions;
create policy "sessions read" on sessions for select to authenticated using (sees_location(location_id));
drop policy if exists "sessions write" on sessions;
create policy "sessions write" on sessions for all to authenticated
  using (is_coach() and (coach_id = auth.uid() or is_director())) with check (is_coach());
drop policy if exists "session athletes rw" on session_athletes;
create policy "session athletes rw" on session_athletes for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and sees_location(s.location_id)))
  with check (is_coach());

-- ---------- Player Development Reports (Simon's format) ----------
create table if not exists player_reports (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes(id) on delete cascade,
  location_id uuid references locations(id),
  author_id uuid references profiles(id),
  report_date date default current_date,
  coaches_line text,            -- COACHES LUCAS · SIMON · FELIPE
  training_type text,           -- SUMMER BLUEPRINT X TRAINING
  confidence int check (confidence between 1 and 10),
  technical int check (technical between 1 and 10),
  effort int check (effort between 1 and 10),
  focus text[] default '{}',
  strengths text,
  develop text,
  reading text,                 -- Reading the numbers
  arc jsonb default '{"m3":{"date":"","desc":""},"m6":{"date":"","desc":""},"y1":{"date":"","desc":""}}',
  next_steps jsonb default '{"sc":"","programming":"","position":"","reeval":"","mentality":""}',
  status text default 'draft',  -- draft | submitted | approved | flagged
  director_notes text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists player_reports_athlete_idx on player_reports(athlete_id, report_date desc);
alter table player_reports enable row level security;
drop policy if exists "reports read" on player_reports;
create policy "reports read" on player_reports for select to authenticated using (sees_location(location_id));
drop policy if exists "reports write" on player_reports;
create policy "reports write" on player_reports for all to authenticated
  using (is_coach() and (author_id = auth.uid() or is_director())) with check (is_coach());

-- ---------- Methodology modules ----------
create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort int default 0,
  summary text,
  body text,                    -- markdown
  video_url text,               -- YouTube / Vimeo / Loom link
  published boolean default false,
  author_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists module_progress (
  user_id uuid references profiles(id) on delete cascade,
  module_id uuid references modules(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key (user_id, module_id)
);
alter table modules enable row level security;
alter table module_progress enable row level security;
drop policy if exists "modules read" on modules;
create policy "modules read" on modules for select to authenticated using (published or is_director());
drop policy if exists "modules write" on modules;
create policy "modules write" on modules for all to authenticated using (is_director()) with check (is_director());
drop policy if exists "progress own" on module_progress;
create policy "progress own" on module_progress for all to authenticated
  using (user_id = auth.uid() or is_director()) with check (user_id = auth.uid());

insert into modules (title, sort, summary, body, published)
select 'Welcome to the Next Level Method', 0,
  'Start here. What the Cognitive Technical Training method is and how every session is built.',
  E'## What this is\n\nThe Next Level Coaching Methodology is how every coach, at every location, delivers the same session. Simon writes and updates these modules; every coach completes them in order.\n\n## How to use the modules\n\n1. Read the module and watch the video.\n2. Shadow a session where it is applied.\n3. Mark it complete. Your manager sees your progress on the Team page.\n\n*Simon: replace this text with the real first module.*',
  true
where not exists (select 1 from modules);

-- ---------- AI assistant log (what staff asked, for improving SOPs) ----------
create table if not exists ai_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  location_id uuid references locations(id),
  question text not null,
  answer text,
  created_at timestamptz default now()
);
alter table ai_questions enable row level security;
drop policy if exists "ai own" on ai_questions;
create policy "ai own" on ai_questions for all to authenticated
  using (user_id = auth.uid() or is_manager()) with check (user_id = auth.uid());
