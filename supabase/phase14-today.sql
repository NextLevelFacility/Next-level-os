-- ============================================================
-- NEXT LEVEL OS — Phase 14: the Owner's daily task list + calendar cache.
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
create table if not exists ceo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due date not null default (now() at time zone 'America/New_York')::date,
  done boolean not null default false,
  done_at timestamptz,
  sort int default 0,
  created_at timestamptz default now()
);
alter table ceo_tasks enable row level security;
drop policy if exists "ceo_tasks own" on ceo_tasks;
create policy "ceo_tasks own" on ceo_tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists ceo_tasks_user_due on ceo_tasks (user_id, due);

-- the calendar feed joins the shared answer cache
drop policy if exists "cache write" on api_cache;
create policy "cache write" on api_cache for all to authenticated
  using (key in ('square', 'pushpress', 'ghl', 'sheets', 'calendar')) with check (key in ('square', 'pushpress', 'ghl', 'sheets', 'calendar'));

select 'phase 14 ok' as result;
