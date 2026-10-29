-- ============================================================
-- NEXT LEVEL OS — Phase 8: commission, cancellations, churn bonus
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table settings enable row level security;
drop policy if exists "settings read" on settings;
create policy "settings read" on settings for select to authenticated using (true);
drop policy if exists "settings write" on settings;
create policy "settings write" on settings for all to authenticated using (is_manager()) with check (is_manager());

-- Sales compensation: 12% commission on what they sign; churn bonus when monthly churn stays under 5%
insert into settings (key, value) values ('sales_comp', '{
  "commission_pct": 12,
  "churn_target_pct": 5,
  "churn_bonus": 0,
  "bonus_people": ["Abe", "Vittorio"],
  "active_members_manual": 0
}'::jsonb)
on conflict (key) do nothing;

-- Per-person override of the commission rate (blank = use the setting)
alter table profiles add column if not exists pay_commission_pct numeric;

select 'phase 8 ok' as result;
