-- ============================================================
-- NEXT LEVEL OS — Phase 7: sales log, training modules for every role
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- Modules for every role (coach = Simon's Method; sales / frontdesk = training), with a structured template
alter table modules add column if not exists audience text[] not null default '{coach}';
alter table modules add column if not exists sections jsonb not null default '{}';
drop policy if exists "modules read" on modules;
create policy "modules read" on modules for select to authenticated
  using ((published and (audience && my_roles() or is_manager())) or is_director() or author_id = auth.uid());
drop policy if exists "modules write" on modules;
create policy "modules write" on modules for all to authenticated
  using (is_director() or author_id = auth.uid()) with check (is_director());

-- Sales log: every meeting booked and every close, by name
create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  location_id uuid references locations(id),
  kind text not null,              -- call | meeting | close | eval
  name text,                       -- lead / athlete / parent
  program text,
  amount numeric,
  when_at timestamptz,             -- meeting time
  note text,
  log_date date not null default current_date,
  created_at timestamptz default now()
);
create index if not exists sales_log_user_idx on sales_log(user_id, log_date desc);
alter table sales_log enable row level security;
drop policy if exists "sales log own" on sales_log;
create policy "sales log own" on sales_log for all to authenticated
  using (user_id = auth.uid() or (is_manager() and sees_location(location_id)))
  with check (user_id = auth.uid());

select 'phase 7 ok' as result;
