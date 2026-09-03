-- Milo: receipt photos attached to trips.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run more than once.
--
-- Two parts: a column on trips to remember which file belongs to which trip,
-- and a private storage bucket that only the file's owner can reach.

-- 1. Where the photo lives, remembered against the trip.
alter table public.trips
  add column if not exists receipt_path text;

-- 2. A private bucket. Not public: every view goes through a short-lived signed
--    link, so a receipt is never readable by URL alone.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

-- 3. Only the owner may touch their own files. Every object is stored under a
--    folder named for the account id, and these policies compare that first
--    path segment with the signed-in user — so one account can never read,
--    replace or delete another's receipts, even by guessing a filename.
drop policy if exists "own receipts read"   on storage.objects;
drop policy if exists "own receipts write"  on storage.objects;
drop policy if exists "own receipts update" on storage.objects;
drop policy if exists "own receipts delete" on storage.objects;

create policy "own receipts read" on storage.objects
  for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own receipts write" on storage.objects
  for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own receipts update" on storage.objects
  for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own receipts delete" on storage.objects
  for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
