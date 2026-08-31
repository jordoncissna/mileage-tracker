-- Milo: which plan each person is on, and who invited them.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run more than once.
--
-- Nothing is locked by this. Every plan unlocks everything today; the column
-- exists so limits CAN be introduced later, deliberately, rather than being
-- retrofitted in a hurry.

create table if not exists public.user_plan (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  plan             text        not null default 'founding',  -- founding | free | pro | premium
  plan_expires_at  timestamptz,                              -- null = does not expire
  referral_code    text        not null,                     -- this person's own share code
  referred_by_code text,                                     -- the code they arrived with, if any
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Share codes must be unique — they are what a referral is counted against.
create unique index if not exists user_plan_referral_code_key
  on public.user_plan (lower(referral_code));

-- Fast lookup when rewards are eventually counted, server-side.
create index if not exists user_plan_referred_by_idx
  on public.user_plan (lower(referred_by_code));

alter table public.user_plan enable row level security;

-- Same shape as the trips and prefs policies: a row is visible and writable
-- only by its owner. Nobody can read anyone else's plan or share code — which
-- is why the app stores the code someone arrived with as plain text rather than
-- looking up who it belongs to. Resolving codes to people is a job for a
-- server-side function later, when rewards are actually granted.
drop policy if exists "own plan" on public.user_plan;
create policy "own plan" on public.user_plan
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
