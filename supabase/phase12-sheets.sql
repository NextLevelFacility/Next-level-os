-- NEXT LEVEL OS — Phase 12: allow the Google Sheets rollup in the shared cache. Safe to re-run.
drop policy if exists "cache write" on api_cache;
create policy "cache write" on api_cache for all to authenticated
  using (key in ('square', 'pushpress', 'ghl', 'sheets')) with check (key in ('square', 'pushpress', 'ghl', 'sheets'));
select 'phase 12 ok' as result;
