-- ============================================================
-- NEXT LEVEL OS — Phase 13: one Google Sheet tracker per person, read by the CEO dashboard.
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- Each sheet must be shared "Anyone with the link · Viewer" so the dashboard can read it.
-- ============================================================
create table if not exists kpi_sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                   -- first name, as on the roster
  kind text not null check (kind in ('sales', 'coach', 'concession')),
  sheet_id text not null unique,                        -- the long id in the Google Sheet URL
  sort int default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table kpi_sheets enable row level security;
drop policy if exists "kpi_sheets read" on kpi_sheets;
create policy "kpi_sheets read" on kpi_sheets for select to authenticated using (is_manager());
drop policy if exists "kpi_sheets write" on kpi_sheets;
create policy "kpi_sheets write" on kpi_sheets for all to authenticated using (is_manager()) with check (is_manager());

insert into kpi_sheets (name, kind, sheet_id, sort) values
  ('Abe',      'sales',      '1fluztyne0F-iFaI5Eju3ltIz9Y78YvYrx3XydwfjChE', 1),
  ('Vittorio', 'sales',      '146Uqq_VPgODYsrfQGm-UJ3Ca4qOmkNHdwegPxYT7iag', 2),
  ('Simon',    'coach',      '1hxaUYOongEvzPbrITC2uGmkTl4GX3X8ZhRT2ULCVJ8o', 3),
  ('Dylan',    'concession', '1ul0GwRaGFqLQNosj59EDotgZAyRpS0WPfmNOUa2JXk8', 4),
  ('Tomas',    'concession', '1R6_Hu2daH_7zpCnKLdn6p19q7JC4nXMLbXYU8zQ7gKE', 5)
on conflict (sheet_id) do update set name = excluded.name, kind = excluded.kind, sort = excluded.sort, active = true;

select 'phase 13 ok' as result;
