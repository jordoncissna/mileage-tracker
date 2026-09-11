-- Milo: let a person delete their own account, without emailing you.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run more than once.
--
-- Why this needs a database function at all: the browser can delete its own
-- rows (row-level security allows that), but it cannot delete the login itself.
-- Removing a row from auth.users needs privileges the app must never hold — the
-- service_role key belongs on a server, never in a page anyone can view source
-- on. A SECURITY DEFINER function is the safe way to lend exactly that one
-- ability, for exactly one row.
--
-- The safety property that matters: this function TAKES NO ARGUMENTS. It can
-- only ever act on auth.uid() — whoever is calling it. There is no parameter to
-- point it at somebody else's account, so a signed-in user cannot delete anyone
-- but themselves, however they call it.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
-- Pinning search_path is not optional for a SECURITY DEFINER function: without
-- it, a caller could put a lookalike table earlier on the path and have this
-- run against theirs with elevated rights.
set search_path = public, auth, storage, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_own_account: no signed-in user';
  end if;

  -- Delete the data explicitly rather than trusting every table to cascade.
  -- user_prefs and user_plan do cascade from auth.users, but the trips table
  -- predates those migrations and its foreign key is not guaranteed, so a
  -- cascade alone could either fail or leave rows behind.
  delete from public.trips where user_id = uid;

  -- These two arrived with their own migrations and may not exist yet.
  if to_regclass('public.user_prefs') is not null then
    delete from public.user_prefs where user_id = uid;
  end if;
  if to_regclass('public.user_plan') is not null then
    delete from public.user_plan where user_id = uid;
  end if;

  -- Receipt files live under a folder named for the account id. The app deletes
  -- them before calling this, but a failed upload or an interrupted delete
  -- could leave one behind, and an orphaned receipt photo is exactly the thing
  -- someone deleting their account does not want left on a server.
  if to_regclass('storage.objects') is not null then
    delete from storage.objects
      where bucket_id = 'receipts'
        and (storage.foldername(name))[1] = uid::text;
  end if;

  -- Last: the login itself.
  delete from auth.users where id = uid;
end;
$$;

-- Only a signed-in user may call it, and only ever for themselves.
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
