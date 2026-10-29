-- ============================================================
-- NEXT LEVEL OS — Phase 11: PushPress plan prices (membership revenue estimate)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- PushPress's API has no payments or prices, so revenue = active plans × the price you set here.
-- ============================================================
create table if not exists plan_prices (
  plan_id text primary key,
  name text,
  category text,
  monthly_price numeric,          -- what an active plan bills per month (blank = unknown, not counted)
  updated_at timestamptz default now()
);
alter table plan_prices enable row level security;
drop policy if exists "plan_prices read" on plan_prices;
create policy "plan_prices read" on plan_prices for select to authenticated using (true);
drop policy if exists "plan_prices write" on plan_prices;
create policy "plan_prices write" on plan_prices for all to authenticated using (is_manager()) with check (is_manager());

select 'phase 11 ok' as result;
