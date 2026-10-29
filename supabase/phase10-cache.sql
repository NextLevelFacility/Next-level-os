-- ============================================================
-- NEXT LEVEL OS — Phase 10: shared cache for Square / PushPress / GoHighLevel answers
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- Every screen reads the last good answer instantly; one caller refreshes it every few minutes.
-- ============================================================
create table if not exists api_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table api_cache enable row level security;
drop policy if exists "cache read" on api_cache;
create policy "cache read" on api_cache for select to authenticated using (true);
drop policy if exists "cache write" on api_cache;
create policy "cache write" on api_cache for all to authenticated
  using (key in ('square', 'pushpress', 'ghl')) with check (key in ('square', 'pushpress', 'ghl'));

select 'phase 10 ok' as result;
