-- Milo: per-user preferences that used to live only in the browser.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run more than once.

create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rules      jsonb       not null default '[]'::jsonb,   -- auto-classify rules
  dismissed  jsonb       not null default '{}'::jsonb,   -- suggestions waved off, per trip
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

-- Same shape as the trips policy: a row is visible and writable only by its owner.
drop policy if exists "own prefs" on public.user_prefs;
create policy "own prefs" on public.user_prefs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
