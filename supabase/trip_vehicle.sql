-- Milo: remember which vehicle each trip was driven in.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run more than once.
--
-- Why this exists: the vehicle used to be a single setting, and the tax report
-- stamped whatever was in Settings at print time onto every row — including
-- trips from years earlier. Changing cars retroactively rewrote the whole
-- history, which is a tax document asserting something untrue. The vehicle
-- belongs to the trip, not to the account.

alter table public.trips
  add column if not exists vehicle text;

-- Existing rows predate the column. Pin them to whatever the account's setting
-- is right now — that is the best available answer for a trip already taken,
-- and once written it stops moving. The app does this for its own rows on first
-- load; this statement is here for completeness if you would rather do it in
-- one pass. It is commented out because only you know what the right value is.
--
--   update public.trips set vehicle = 'Tesla Model Y'
--   where vehicle is null and user_id = auth.uid();
