# What's new in Milo

Newest first. Written for the person using the app, not for the code —
if a change doesn't alter what you see or what you can trust, it isn't here.

---

## Delete your own account, without emailing anyone
*One-time setup: run `supabase/delete_account.sql` in the Supabase SQL editor*

Settings → **Delete my account**. It removes every trip, every receipt photo and
every setting from the servers, clears the copy on your device, and signs you
out. You type DELETE to confirm, and there is no restore — export first.

Until now the privacy policy said to email you and wait. That's a fragile way to
honour a right people are legally entitled to, and it meant every request landed
in your inbox as manual database work. Now it doesn't.

Two things worth knowing about how it's built. The browser can delete its own
rows, but it cannot delete the login itself — that needs privileges the app must
never carry, since anyone can read a web page's source. So the deletion runs as a
database function instead. **That function takes no arguments**: it can only ever
act on whoever is calling it, so there is no way to point it at someone else's
account. And receipt photos are deleted through the storage API first, because
that's what removes the actual image — someone closing their account cares more
about the photo than the database row.

If you haven't run the SQL, the button says so rather than pretending the account
is gone.

## The rest of the launch list: an FAQ, and an accessibility pass

**There's an FAQ now** (`faq.html`), written from the questions people actually
ask — starting with the one that matters most: no, Milo does not track your
drives in the background, and never has. It also covers what the IRS wants,
who can see your trips, what happens if you lose your phone, whether it's free,
and using Milo outside the US.

**Where your data lives is now stated.** Your Supabase servers are in the United
States (US West). The privacy policy says so, and says that using Milo from
abroad means your information is transferred there. That disclosure is required
once someone outside the US signs up.

**An accessibility pass, with the findings measured rather than guessed:**

- **Four images had no alt text** — all of them the Milo logo. They now carry
  `alt=""` so a screen reader skips them, which is correct: the word MILO is
  right beside each one, and hearing "Milo Milo" is worse than hearing it once.
- **Muted grey text failed the contrast standard** in light mode — 3.01:1 where
  4.5:1 is required. It's now 4.81:1. This affects small print all over the app.
- **Twelve controls had no name a screen reader could read** — the History
  filters, the Analytics selects, the four year-rate boxes, and two fields in
  the log window. All named now.
- **Each view has a heading** for screen-reader navigation, invisible on screen.
- **The keyboard focus ring is now designed** rather than left to the browser.
  Honest correction: focus was *not* missing before, as I first reported — the
  browser's own faint 1px ring was there. It's now a 2px accent ring with a
  halo, which is a real improvement but a smaller one than I first claimed.

**robots.txt and sitemap.xml** are in place too. Modest value while the app sits
behind a sign-in, but now that the FAQ and both policy pages are real public
pages, they cost nothing and are correct.

## Honest about borders: US rules, and rights where you live

Milo is a Utah company, but the people you invite won't be — some won't be in
the US at all. Two things needed saying out loud.

**Milo is built for US federal tax rules, and now says so.** Your tax report
cites IRC §274(d), uses the IRS standard mileage rate and prints US dollars.
Someone filing in the UK or Canada was getting a document confidently quoting
American tax code at them. The report now states plainly that it follows United
States federal rules, and that if you file elsewhere the mileage is still yours
but the rate and citations won't match your tax authority. The same note sits
beside the rates in Settings, where it's read before a report is ever made, and
the Terms have a section of their own on it.

**Utah law still governs — but it can't take away rights your country gives
you.** The Terms now say so. If you use Milo somewhere with consumer protections
that can't be waived by agreement — the EU and UK, and several US states — those
still apply, and a clause that conflicts with them simply drops out instead of
taking the whole agreement down with it. That's protection for Milo as much as
for the user: a clause that overreaches can be struck out entirely by a foreign
court.

## A front door: link previews, a real pitch, and Terms

Audited Milo against a 20-item launch checklist. Seven items were already in
place, five partial, eight missing. These are the three that actually mattered.

**Sharing a link showed nothing.** No preview image, no title, no description —
a bare URL. That was costing you invites: the whole referral feature works by
someone pasting a link into a text or a group chat, and the moment they decide
whether to tap is the moment that preview appears. Milo now has a proper share
card, so a pasted link shows the name, the pitch, and an image.

**The sign-in screen said "Mileage Tracking App".** That's a label, not a
reason. It now leads with what Milo is for — mileage records built for an audit
— and three things you actually get: every trip carrying what §274(d) asks for,
receipts attached to trips, and a free CSV and PDF export. The browser tab says
"Milo — IRS-ready mileage log" instead of "Mileage Tracker".

**There's a Terms of Service now.** Plain language, and it locks in two things
worth reading: Milo keeps records but **is not tax advice** — what you may
deduct is between you and a tax professional — and **export and the tax report
are permanently free on every plan**, because they're your own substantiation.
Linked from the sign-in screen and the privacy policy.

Not done, and deliberately: robots.txt, sitemap.xml and search-engine tags.
Those describe a landing page, and today the site is an app behind a login —
there is nothing for Google to usefully index yet.

## Three bugs found by stress-testing the app

Pushed Milo well past your own data — 3,000 trips, hostile text in every field,
a device with no free space, and files imported twice. It held up on almost
everything; three things did not.

**Importing the same CSV twice duplicated your entire ledger.** Not the file's
rows — *every trip in the account*, given a second copy on the server, silently,
while the message said "0 trips synced". Reproduced going from 10 rows to 20.
Two separate mistakes had to line up for it, and both are fixed: the import now
syncs only the rows it actually created, and Milo now refuses to upload a trip
that already has a row on the server.

**A trip logged on a full device was lost with no message.** When the phone or
browser runs out of space, saving the local copy fails — and that failure was
taking the whole save with it. The trip reached neither the device nor your
account, the form stayed filled in, and nothing was said. Now the trip still
goes to your account, the form clears, and Milo tells you the device is full.

**Mileage had no upper limit.** A typo of `1e308` was accepted and turned the
tax report into "1e+308 mi — $6.999999999999999e+307" and Analytics into $NaN.
A single trip is now capped at 10,000 miles — the longest drive in the lower 48
is about 3,500 each way.

Imported files are also checked properly now: an unreadable date like
`not-a-date`, an impossible one like `2026-13-45`, and a made-up category all
used to go straight into the ledger. They're rejected or corrected instead.

**What held up:** at 3,000 trips — about sixty times your current ledger —
History renders in 0.6s, Analytics in 0.14s, the tax report builds in 10ms.
Eight hostile payloads across the ledger, the duplicate reviewer and the tax
report executed nothing. Overlapping refreshes still insert nothing, 25 rapid
saves still make exactly 25 rows, and deletes still survive an immediate reload.

## The tax report carries the receipts themselves

The report used to say *Receipt: attached* and stop there. An auditor can't see
your storage bucket, and the links Milo uses expire after five minutes — so a
"yes" you couldn't produce the document for was worth close to nothing.

The receipts are now **inside the report**. Each one is numbered (R-1, R-2), the
trip's row points at its number, and the images print after the mileage log with
a caption naming the date, route, purpose and miles they belong to. One file,
mileage log plus evidence, nothing to log into.

- **Receipts start on a fresh page**, so the mileage log stays clean.
- **Images are re-encoded smaller** for the report. Forty full-size photos is a
  packet nobody can email.
- **A receipt that can't be fetched still gets a numbered slot** saying so,
  rather than vanishing — a gap with no explanation reads as "there was no
  receipt".
- Generating a report with receipts takes a few seconds now; it tells you it's
  collecting them, and waits for the images before opening the print dialog.

## The unlogged-days reminder is a card, not a banner

It stretched the full width of the window — a white band across the middle of
Home, while every other panel there is a compact card. It now sits under the
stat tiles at the same size as them, with the five day chips on one row.

Nothing about what it says or when it appears has changed.

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
