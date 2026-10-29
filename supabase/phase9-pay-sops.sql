-- ============================================================
-- NEXT LEVEL OS — Phase 9: pay rates for pre-registered teammates + SOP Studio (rewrites and videos per SOP)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- 1) Pay rates travel with the pre-registration and land on the profile at sign-up
alter table team_invites add column if not exists pay_hourly numeric;
alter table team_invites add column if not exists pay_per_session numeric;
alter table team_invites add column if not exists pay_commission_pct numeric;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  miami uuid;
  inv team_invites%rowtype;
  nm text;
begin
  select count(*) into n from profiles;
  select id into miami from locations where slug = 'miami';
  nm := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  insert into profiles (id, email, full_name, role, location_id)
  values (new.id, new.email, nm, case when n = 0 then 'owner' else 'newhire' end, miami);

  select * into inv from team_invites
   where claimed_by is null
     and (lower(email) = lower(new.email) or (email is null and lower(full_name) = lower(split_part(nm, ' ', 1))) or (email is null and lower(full_name) = lower(nm)))
   order by (lower(email) = lower(new.email)) desc nulls last
   limit 1;
  if found then
    update profiles set role = inv.role, roles = inv.roles, title = inv.title, location_id = coalesce(inv.location_id, miami),
                        pay_hourly = inv.pay_hourly, pay_per_session = inv.pay_per_session, pay_commission_pct = inv.pay_commission_pct
     where id = new.id;
    update team_invites set claimed_by = new.id, claimed_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- The rates Gabriel set (commission stays on the 12% default; churn bonus comes from the Sales comp setting)
update team_invites set pay_hourly = 15.50 where lower(full_name) in ('dylan', 'tomas');
update team_invites set pay_per_session = 20 where lower(full_name) = 'abe';
update team_invites set pay_per_session = 40 where lower(full_name) = 'vittorio';
-- …and on their profiles if any of them already signed up
update profiles set pay_hourly = 15.50 where role <> 'owner' and lower(split_part(coalesce(full_name, ''), ' ', 1)) in ('dylan', 'tomas');
update profiles set pay_per_session = 20 where role <> 'owner' and lower(split_part(coalesce(full_name, ''), ' ', 1)) = 'abe';
update profiles set pay_per_session = 40 where role <> 'owner' and lower(split_part(coalesce(full_name, ''), ' ', 1)) = 'vittorio';

-- 2) SOP Studio: every SOP in the vault can be rewritten and given a video here, without touching Obsidian
create table if not exists sop_docs (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                 -- "<department slug>#<sop slug>" (matches the vault outline) or a custom key
  dept text,                                -- department page title, e.g. "Sales & Membership"
  title text not null,
  roles text[] not null default '{}',       -- who must read it: coach, sales, frontdesk, director, operator
  video_url text,                           -- YouTube / Vimeo / Loom / Google Drive link
  body text,                                -- Markdown. Null = still the vault outline
  status text not null default 'outline' check (status in ('outline', 'draft', 'published')),
  sort int default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table sop_docs enable row level security;
drop policy if exists "sop_docs read" on sop_docs;
create policy "sop_docs read" on sop_docs for select to authenticated using (status = 'published' or is_director());
drop policy if exists "sop_docs write" on sop_docs;
create policy "sop_docs write" on sop_docs for all to authenticated using (is_director()) with check (is_director());

select full_name, pay_hourly, pay_per_session, pay_commission_pct, claimed_by is not null as signed_up from team_invites order by created_at;
