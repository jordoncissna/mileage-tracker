-- Milo: lock the trips table to its owner. Run ONLY if check_rls.sql showed
-- `trips` with row-level security off, or with no policies.
-- Safe to run more than once.
--
-- This is the property the whole product rests on. The Supabase anon key is
-- public — it is in the page source, which is correct and by design — so the
-- database itself has to be what stops one account reading another's. Without
-- these policies the key alone is enough to read and delete every trip in the
-- table.
--
-- Read the warning at the bottom before running this on a table that already
-- has data in it.

alter table public.trips enable row level security;

-- Named policies are replaced rather than duplicated, so re-running is safe.
drop policy if exists "own trips read"   on public.trips;
drop policy if exists "own trips insert" on public.trips;
drop policy if exists "own trips update" on public.trips;
drop policy if exists "own trips delete" on public.trips;

create policy "own trips read" on public.trips
  for select to authenticated
  using (auth.uid() = user_id);

create policy "own trips insert" on public.trips
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Both halves matter: `using` decides which rows you may touch, `with check`
-- stops you reassigning one to somebody else on the way out.
create policy "own trips update" on public.trips
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own trips delete" on public.trips
  for delete to authenticated
  using (auth.uid() = user_id);

-- WARNING, read before running:
-- Any existing row whose user_id is null becomes invisible to everyone the
-- moment RLS is on — it matches no policy. That is the correct outcome for a
-- shared database, but it will look like trips vanished. Check first:
--
--   select count(*) from public.trips where user_id is null;
--
-- If that is not 0, decide who those rows belong to and set user_id before
-- enabling, rather than discovering it afterwards.
