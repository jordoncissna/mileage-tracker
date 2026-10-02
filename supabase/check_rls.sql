-- Milo: BEFORE you give the link to anyone else, run this.
-- Read-only. It changes nothing. Paste it into the Supabase SQL editor
-- (Dashboard → SQL Editor → New query) and read the two result sets.
--
-- Why this exists: every other table in this app got its row-level security
-- from a file in this folder, so it is reviewable. `trips` did not — it is the
-- oldest table and its policies were created by hand in the dashboard, which
-- means nothing in the repo proves they are there. Row-level security is the
-- ONLY thing separating one account's mileage log from another's: the anon key
-- is public by design and ships in the page. If RLS on `trips` is off, the
-- first person who signs up sees your trips, and can delete them.

-- 1. Is row-level security actually ON for each table?
--    Every row must read rls_enabled = true.
select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  c.relforcerowsecurity                       as rls_forced,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('trips','user_prefs','user_plan')
order by c.relname;

-- 2. What does each policy actually say?
--    Every qualifier below should compare against auth.uid(). A policy whose
--    qualifier is `true`, or null, lets every signed-in account read the row.
select
  tablename,
  policyname,
  cmd            as applies_to,
  roles,
  qual           as using_expression,
  with_check     as write_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('trips','user_prefs','user_plan')
order by tablename, cmd, policyname;

-- Expected for `trips`: rls_enabled = true, at least one policy, and every
-- using/with_check expression mentioning auth.uid() = user_id.
-- If `trips` comes back with rls_enabled = false or policy_count = 0,
-- STOP and run trips_rls.sql before sharing the link.
