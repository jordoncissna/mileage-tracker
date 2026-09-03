# What's new in Milo

Newest first. Written for the person using the app, not for the code —
if a change doesn't alter what you see or what you can trust, it isn't here.

---

## Receipts on trips
*PR #39 — one-time setup: run `supabase/receipts.sql` in the Supabase SQL editor*

Attach a photo to a trip — a toll, parking, a client lunch. On a phone the
button opens the camera directly.

Mileage proves you drove. A receipt proves the expense, which is the
substantiation an auditor asks for that miles alone can't give.

- **📎 in History** on any trip that has one; tap to view it full size.
- **Remove** it from the viewer, which deletes the stored file too.
- **The tax report** gains a Receipt column and a line in the summary saying how
  many trips have one attached.
- **Photos are shrunk before upload** — a phone photo is several megabytes and a
  legible receipt is a few hundred kilobytes.
- **Private by default.** The storage bucket is not public: every view goes
  through a link that expires in five minutes, and the permission rules mean
  nobody can reach your files but you.

If you haven't run the SQL, nothing breaks — trips save as normal and simply
don't take a photo.

## Security fix: an address could inject code into the duplicate review
*PR #38*

A security review found that the **Review duplicates** screen built one of its
buttons by pasting the trip's address straight into HTML, using an escaper meant
for JavaScript rather than one meant for HTML. An address containing a quote
mark could break out and attach its own code to the page.

Why it mattered: History lets you import a CSV, so trip addresses can come from
a file someone else sends you. A crafted address in that file could have run
code in your browser with access to your signed-in session — meaning your whole
trip history.

Nothing suggests this was ever used against you; it was found by review, not by
an incident. Fixed by referring to each group by position instead of by name, so
there is no text to break out of.

The same bug had also been quietly breaking the **keep first** button — its
click handler was cut in half by the stray quote, so pressing it did nothing.
That works now.

## Groundwork for plans and invite rewards
*PR #37 — one-time setup: run `supabase/user_plan.sql` in the Supabase SQL editor*

**Nothing is locked and nobody is charged.** This is the plumbing that would
make plans possible later, built so it can't go wrong quietly:

- **Your invite link no longer contains your Supabase user ID.** It used to —
  an internal identifier, in a link people paste into group chats. Every account
  now gets a short random share code instead.
- **Invites can finally be counted.** The link always ended in `?ref=…` but
  nothing in the app read it, so a referral reward was impossible. Arriving on
  someone's link now records who invited you, once, when your account is
  created — and the code is stripped from your address bar so it can't end up
  in the links you share.
- **One place decides what's unlocked.** Everything is unlocked for everyone
  today. The export and the tax report are marked as permanently free and the
  tests fail if anything ever gates them — including for an expired plan.

If you haven't run the SQL, nothing breaks: Settings says plan tracking is off
and the app carries on exactly as before.

## A first run that tells the truth
*PR #33*

Walking the app as a brand-new user turned up three things worth fixing:

- **Onboarding sold a feature Milo doesn't have.** Two full screens promised
  automatic background GPS tracking — "no manual entry needed". Milo has never
  tracked automatically. A new user was taught the wrong model and every trip
  they typed in afterwards would have felt like a bug. Those screens now show
  how logging actually works, and what an auditor looks for.
- **The sign-in screen claimed end-to-end encryption.** Your data is encrypted
  in transit and at rest, but the server can read it — that is not end-to-end,
  and it isn't a claim to leave sitting on a login screen. Corrected.
- **An empty account showed four zeroes.** Now it shows a short setup path —
  log a trip, add your home address, name your business and vehicle — that
  ticks itself off as you go, with the walkthrough one click away.

Along the way: the old empty-state button was a full-screen layer that dimmed
the page and swallowed clicks meant for anything underneath it. Gone. And on a
phone with nothing logged, the empty map no longer takes the top 400px before
you reach anything you can act on.

## Small things, first-run polish
*PR #35*

- **Your first trip now says what it's worth.** "First trip logged — $56.84
  deductible" instead of a generic tick. That number is the whole point of the
  app; it shouldn't take a trip to Analytics to see it.
- **Removed the PRO badge from auto-classify rules.** There is no Pro plan, the
  feature is free, and anyone you invite was seeing a paywall hint on something
  they already had. It comes back if and when plans actually ship.

## A nudge for days with nothing logged
*PR #32*

Home now shows the recent days that have no trips against them, with a tap to
log one dated to that day. It's built to be quiet and honest: it never claims
you drove — only that a day is empty — it learns which weekdays you actually
log so it can't nag a Sunday you never work, it stays silent until you have
enough history to have a pattern, "Not now" hushes it for the week, and there's
a switch in Settings to turn it off for good.

Why it matters: the IRS wants contemporaneous records. A log written the same
week holds up in an audit; one rebuilt at tax time is the part that gets
challenged.

## Rules follow you between devices
*PR #30 — one-time setup: run `supabase/user_prefs.sql` in the Supabase SQL editor*

Auto-classify rules and the suggestions you've waved off used to live only in the
browser you created them in. Make a rule on your laptop and your phone never knew
about it; dismiss a suggestion on one and it came back on the other.

They now live with your trips. Delete a rule anywhere and it stays deleted.
Dismiss a suggestion anywhere and it stays dismissed. Settings tells you which
mode you're in, so sync is never silently off.

## Find a place by name, and see the distance you asked for
*PR #29*

- Search the log form by **business name** — "Chili's", not just a street number.
  Picking one fills in its actual street address, city and state.
- **Calculate distance** now shows its result and fills the Miles field for you.
  It had been rendering 2 pixels tall — the numbers were right, the box was
  squeezed to a sliver by the surrounding layout.
- A failed address lookup now says so instead of going quiet. If Google's Places
  API isn't enabled on the key, the app tells you that rather than looking broken.

## Address suggestions while you type
*PR #28*

Type three characters into either address field and pick from a list — click, or
arrow keys and Enter. Addresses you've already driven rank first, and they're
still offered when Google can't be reached.

## Full-app QA pass
*PR #27*

- **Export CSV** exports what the ledger is showing. It had ignored the month and
  category filters and dumped the whole year.
- The CSV and the tax report no longer carry a dead **Commute** column and line
  item — leftovers from a feature that was removed.
- Onboarding no longer asks new users for their daily commute.
- The log window can be closed on a phone. It previously offered only "esc to
  close", and a phone has no Esc key.

## Deleted trips stay deleted
*PR #26*

The delete was reaching the server six seconds later, when the undo toast
expired. Refresh inside that window — which is what people do — and the row was
still on the server, so the next load brought it back. Deletes now commit
immediately; undo puts the trip back instead.

## Duplicate trips: stopped at the source, plus a way to clean up
*PR #24*

Overlapping refreshes were each re-uploading the same unsynced trip, minting
duplicate rows on the server. A trip whose upload got interrupted was re-sent on
every later load, forever.

Sync now runs one load at a time, adopts a matching server row instead of
inserting a copy, and records the server id on the trip itself. **History →
Review duplicates** groups repeated routes on the same day and clears the extras
in one pass, with undo.

## Your trip is always on the map
*PR #25*

The map only drew a route if you'd used Calculate distance. It now follows the
address fields as you fill them in, keeps the saved trip drawn after the window
closes, and falls back to a dashed straight line when Google can't route the
pair. Switching theme no longer wipes it.

## Edit a saved trip
*PR #22*

Change the date, route, purpose, category or miles of a trip you already logged.
Saving the same route twice on the same day now asks first.

## Log-flow rework
*PR #20*

- The **Commute** option is gone. Every logged trip is a business write-off.
- A round trip is **one line item** with doubled miles, not two rows.
- The log window can be dragged, and addresses sit at the top instead of behind
  a dropdown.

## Mission Control
*PRs #14–#19, #21*

New Home view over a full-bleed map, a resizable labelled nav rail, a ⌘K log
window, and a reworked History, Analytics and Settings. Light is the default
theme; dark is available.

## Earlier
*PRs #1–#13*

Multi-trip entry (multi-stop, round trip, repeat across dates), modernized
analytics, offline-capable PWA, tax-ready PDF report, referral invites, privacy
policy, and the route-map ghost layer (later removed by owner decision).
