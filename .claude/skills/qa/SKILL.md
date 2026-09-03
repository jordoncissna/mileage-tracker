---
name: qa
description: Verification protocol for Milo. Invoke before telling the owner a feature, fix, or change is done — it defines what counts as evidence, and blocks "done" claims that rest on unit tests or code reading alone.
---

# QA — what "done" is allowed to mean

This exists because "all green, shipped" was said about features that were
broken the moment the owner touched them: Commute pills that came back after a
refresh, round trips that logged two rows, an edit button that silently
discarded the edit, duplicate trips piling up in the ledger. Every one of those
passed the unit tests. The tests were measuring the wrong thing.

**Rule: a feature is done when the failure the owner would hit has been
reproduced and then shown to no longer happen. Not when the code looks right.**

## The five gates

Work through them in order. If a gate can't be met, that goes in the report as
an explicit "not verified" — never as silence.

### 1. Reproduce first

Before writing a fix, reproduce the reported behavior and paste the actual
numbers. "I did the same trip on 8/11, 8/12, 8/13 and got 9 rows" means you
must produce 9 rows first. If you can't reproduce it, the diagnosis is a guess
— say so, and go looking for a mechanism that explains the owner's screenshot
before changing anything.

State counts, not adjectives: rows before, rows after, totals, server inserts.

### 2. A failing test, then the fix

Write the regression test against the current (broken) code and watch it fail.
Then fix, and watch it pass. A test written after the fix proves nothing about
whether it catches the bug.

Prove it explicitly — revert the fix, run the test, confirm red, restore:

```bash
cp index.html /tmp/idx.bak
# ...revert just the fix hunk...
node tests/<suite>.test.js   # expect FAILs, and name them in the report
cp /tmp/idx.bak index.html
node tests/<suite>.test.js   # expect green
```

### 3. Test the layer the bug lives in

Match the test to the mechanism, or it will pass while the bug ships:

| Symptom | Where it actually lives | What to drive |
|---|---|---|
| Wrong rows / wrong miles after saving | `addTrip` and batch logic | jsdom, fill the real inputs, call the real handler |
| "I deleted it and it came back" | sync (`loadFromSupabase`, `saveToSupabase`) | `tests/sync.test.js` — a recording Supabase stub, count inserts and deletes |
| "I changed it and it reverted" | persistence — localStorage and the server round trip | save, reload the array from storage, load again, re-check |
| Button does nothing | handler exposed on `window`? overlay z-index? | real browser click via `elementFromPoint`, not a direct function call |
| Looks wrong / cut off | CSS | screenshots at 390, 768 and 1360, both themes |

In-memory state is not proof. Anything that touches trips must be re-checked
**after a simulated reload** (re-read `ml3_trips`) and **after a second
`loadFromSupabase`** — that second load is where duplicates were born.

### 4. Drive it like the owner does

`node tests/` alone has never caught one of these. Open the real page in
Chromium and click the real controls:

```bash
node .claude/skills/qa/harness.js        # boots index.html with Supabase + Maps stubbed
```

Rules for browser checks:
- Never assert on a fixed `waitForTimeout` for something the app draws
  asynchronously — poll for the end state (`mapSettled()` in the harness). A
  fixed sleep turns a real race into a test that passes two runs out of three.
- Click through `elementFromPoint(x, y)` on the element's own center — that
  catches the "something invisible is on top of it" class of bug that a direct
  `.click()` on the node hides.
- Do the whole user flow, including the boring parts: open, type, save, close,
  **reload**, look again.
- Do the destructive parts at human speed, which is *fast*. Never insert a wait
  that a person would not take — a sleep placed before a reload can hide the
  exact race the owner is hitting.
- Count what's on screen and compare it to what should be there.
- A check whose element is missing must FAIL, not throw — guard `evaluate`
  (`ask()`) and `fill`/`click`/`press` with catches. An unguarded call aborts
  the run and hides every check after it, which reads as "fewer failures".
- Google Maps tiles do not load in this sandbox (`maps.googleapis.com` is
  reset at the proxy). Anything depending on live tiles is **unverifiable
  here** — say that in the report rather than implying you saw it.

### 5. Report evidence, and the gaps

The closing message must carry:
- the exact commands run and their pass/fail counts;
- the before/after numbers for the reproduced failure;
- what was verified in a real browser vs. only in jsdom;
- **what you could not verify, listed plainly.**

Banned closing lines unless the numbers above are present: "all green",
"everything works", "verified end to end", "should be fixed now".

If a gate was skipped, the honest sentence is: *"I did not verify X — here is
how you can check it in ten seconds."*

## Standing regression checklist

Run this whenever trip logic, sync, or the log overlay changes. These are the
things that have broken before, in the ways they broke:

- [ ] One trip, no stops, no repeat dates → **exactly one** row.
- [ ] Round trip on → **one** row with doubled miles, not two rows.
- [ ] Same trip repeated across 3 dates → **exactly 3** rows, each with the
      full round-trip miles.
- [ ] Multi-stop with round trip → legs × dates rows, return folded into the
      last leg, no extra return row.
- [ ] Save the same route on the same date twice → the duplicate confirm fires.
- [ ] Edit a saved trip → the values change, survive a reload, and the trip
      count does **not** grow.
- [ ] Delete a trip, then reload **immediately** — no waiting for the undo
      window. It must stay deleted, and the server row must be gone. Giving the
      undo timer time to lapse first is how a deferred server delete passed QA
      while the owner watched rows come back after a refresh.
- [ ] Bulk-clean duplicates, then reload immediately — same rule.
- [ ] Two overlapping `loadFromSupabase()` calls → **one** insert.
- [ ] Add a rule, clear the local copy, reload → the rule comes back from the
      server. Delete a rule, sync again → it stays deleted.
- [ ] With `user_prefs` missing, the app still logs trips and says rules are
      device-only.
- [ ] Attach a photo → it uploads under `<user id>/…`, shows a 📎 in History,
      opens through a signed link, and removing it clears both the marker and
      the stored file.
- [ ] With the receipts bucket missing, the trip still saves and claims no
      receipt.
- [ ] No trip anywhere shows a Commute flag; no commute rows in the tax report.
- [ ] Typing 3+ characters into a Street field offers suggestions; clicking one
      fills street/city/state; ↑/↓ + Enter picks without saving the trip; Esc
      closes the list and not the overlay; suggestions are tappable at 390px.
- [ ] Typing both addresses draws the route on the log map; the saved trip is
      still drawn after the overlay closes.
- [ ] An unroutable pair still draws something (dashed straight line), never a
      blank map.
- [ ] Switching theme does not wipe the drawn route.
- [ ] Every view is reachable from every other view (Settings has trapped the
      user before).
- [ ] Light is the default theme; dark renders without unreadable text.
- [ ] 390 px wide: nothing overflows horizontally, bottom nav reachable, log
      overlay not underneath it.

## Before you claim it's done

0. If the owner would notice this change, it needs a `CHANGELOG.md` entry in
   the same PR — in their language, not the code's.
1. `cd tests && npm test` — all four suites.
2. `node .claude/skills/qa/harness.js` — behavioral pass in Chromium.
3. Re-read the owner's original words and answer them literally. If they said
   "3 line items", the report says how many line items there were.
