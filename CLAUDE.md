# CLAUDE.md — Milo Mileage Tracker

Guidance for Claude Code when working in this repository.

## What this is

Milo is an IRS-auditable mileage tracker. It is a **single self-contained
`index.html`** — all markup, CSS, and JavaScript live in that one file. There is
**no build step, no framework, and no bundler.** It is served as a static page
from GitHub Pages and installs as a PWA on iPhone (Add to Home Screen).

Live: https://jordoncissna.github.io/mileage-tracker

## Architecture (read before editing)

- **App logic is one file** (`index.html`), plus a thin PWA layer:
  `manifest.webmanifest`, `sw.js` (service worker: network-first navigations,
  stale-while-revalidate for icons + the jsdelivr CDN scripts; never touches
  googleapis/supabase.co traffic), and `icons/`. Bump the `CACHE` name in
  `sw.js` only if you change the caching strategy — HTML updates flow through
  automatically via network-first.
- **`index.html`** structure, in order:
  - external `<script>` tags: Google Maps JS API, Supabase JS, qrcode
  - a single large `<style>` block
  - the `<body>` markup (nav, trip entry, history, analytics, settings, modals)
  - one large inline `<script>` block holding all application logic
- **State:** an in-memory `trips` array and a `cfg` settings object.
- **Persistence:**
  - Supabase (Postgres + Auth, row-level security) is the source of truth for trips.
  - `localStorage` holds device-local settings. Keys: `ml3_trips` (cache),
    `ml3_set` (cfg: rates, home/office, commute toggles, auto-classify rules),
    `ml3_routew` (remembered Route column width), `ml3_geo` (address→[lng,lat]
    geocode cache for the map ghost layer; failures cached as null).
- **Maps:** Google Maps JS API (Places autocomplete + Geometry for distance).
  The log map is **always** driven: `previewLogRoute()` follows the address
  fields (debounced), `drawTripOnMap()` draws the pair — Directions when it can
  answer, a dashed geocoded straight line when it can't — and the saved trip
  stays drawn after the overlay closes. `gShownTrip` remembers what is on the
  map so `applyMapMode()` can redraw it after a theme rebuild.
- **Auth email:** Resend SMTP via Supabase.

## Data model

**Supabase `user_prefs` table** (one row per user): `user_id`, `rules` (jsonb),
`dismissed` (jsonb), `updated_at`. Created by `supabase/user_prefs.sql`, which
the owner runs once in the SQL editor. Auto-classify rules sync through it:
rules are **last-write-wins** by `updated_at` so a deletion sticks, dismissed
suggestions are **unioned** so waving one away on a phone can't un-dismiss it on
a laptop. If the table is missing, `loadPrefsFromSupabase()` detects it, turns
sync off for the session and says so under the rules panel — trip logging must
never depend on it.

**Supabase `trips` table:** `id`, `user_id`, `date`, `miles`, `from_addr`,
`to_addr`, `purpose`, `category`, `coords`, `from_latlng`, `to_latlng`.

**Local trip object:** `{ id, date, miles, from, to, purpose, category, coords,
fromLatLng, toLatLng, supaId, isCommute? }`. Note `isCommute` (manual override)
is **local only** — it is not persisted to Supabase yet.

**CSV export** carries Date, From, To, Purpose, Category, Miles, Rate,
Deductible Value, Vehicle — no Commute column, and it exports the *filtered*
ledger, not the whole year.

**Categories:** Office Visit, Blockchain Work, Team Meeting, Client Meeting,
Business Errand, Conference / Event, Bank / Finance, Office Supplies, Other
Business, Personal (Non-deductible).

**Deductibility:** `deductibleValue()` / `deductibleMiles()` return 0 only for
category `Personal (Non-deductible)`. The commute concept was REMOVED by owner
decision (isCommute() always returns false; legacy cfg flags are forced off on
load) — every logged trip is a business write-off. `addrMatches()` /
`normalizeAddr()` survive for Home/Office labels and saved-route matching.

**Deletes commit upstream immediately.** `del()` and `deleteDupSelection()`
call `deleteFromSupabase()` straight away and use the undo toast only to
*re-insert*. The delete used to be deferred to the toast's 6s expiry, so a
refresh inside that window left the row on the server and the next load pulled
it back — the "I deleted it and it came back" bug. Don't move it back onto a
timer.

**Sync is idempotent, deliberately:** duplicate rows in the ledger came from
the sync path, not from `addTrip()`. `loadFromSupabase()` is single-flight
(`_supaLoading`), skips trips whose insert is still in flight (`_saving`), and
*adopts* a matching server row (`tripFingerprint()`: date + route + miles +
purpose) instead of inserting a second copy. `saveToSupabase()` stamps `supaId`
on the trip object itself, so a refresh swapping the `trips` array mid-insert
can't strand a trip as permanently unsynced. Don't loosen any of these without
running `tests/sync.test.js`.

**Round trips are ONE line item:** the round-trip toggle doubles the trip's
miles (or uses the Maps round distance) instead of logging a separate return
trip; in multi-stop batches the return distance folds into the last leg.

## Key functions (search these names in index.html)

- `addTrip()` — create a trip from the entry form (builds `from`/`to` from the
  visible street/city/state fields via `buildAddr()`).
- `clearF()` — reset the entry form.
- `filteredTrips()` — the year/month/category slice the ledger is showing;
  `renderH()` and `doExport()` both use it so Export CSV matches the screen.
- `renderH()` — render the history table.
- `gapDays()` / `renderNudge()` — the unlogged-day reminder on Home. Reports only
  that a day is empty, never that a trip was missed; learns which weekdays the
  owner actually logs; silent under 5 trips; `cfg.nudgeOff` turns it off.
- `renderAnalytics()` — render hero stats, the SVG period chart, category bars.
- `suggestFor()` / `ruleMatches()` — auto-classify rules engine (suggest-and-confirm).
- `loadPrefsFromSupabase()` / `savePrefsToSupabase()` / `schedulePrefsPush()` —
  rules + dismissals sync. `persistCfg()` is the single write point and pushes
  only when the rules fingerprint actually changed.
- `addrSuggest()` / `acPick()` / `savedAddrMatches()` — the address suggestion
  dropdown under each Street field. Our own list, not Google's `.pac-container`
  (which fights the draggable overlay's stacking and scrolling). Previously
  driven addresses rank first and are offered even when Places can't answer.
- `previewLogRoute()` / `drawTripOnMap()` / `drawStraightRoute()` — the live map
  preview behind the log overlay.
- `saveToSupabase()` / `updateTripInSupabase()` — sync.
- `dupGroups()` / `openDupReview()` — the duplicate-review tool in History:
  groups trips sharing a date and route, preselects only byte-identical
  repeats, bulk-deletes with a 6s undo.

## Conventions

- Vanilla ES: `var`/`function`, terse style, no external libraries beyond the
  three CDN scripts already present. Match the surrounding code.
- New DOM handlers referenced from inline `onclick`/`onpointer*` must be exposed
  on `window` (e.g. `window.addRule = addRule;`) — the inline script runs in its
  own scope.
- Colors and spacing come from CSS variables in `:root` (dark theme) with a
  light-mode override in a media query. Don't hardcode hex where a variable
  exists. Category colors live in the `PCOLOR` map.

## Testing

Tests live in `tests/` and run against `../index.html` with Node + jsdom.

```bash
cd tests && npm install && npm test
```

- `tests/rules.test.js` — pure-logic tests (rules engine, commute/personal
  deductibility, rates). Extracts functions from `index.html` and evals them.
- `tests/dom.test.js` — DOM-level tests via jsdom with Google/Supabase stubbed
  (Clear button, add-trip flow, analytics render). Externals can't be reached in
  a test env, so they are stubbed.
- `tests/sync.test.js` — sync + duplicate hygiene against a recording Supabase
  stub (concurrent loads, adoption, in-flight markers, the duplicate-review
  tool). These are the regression tests for the duplicate pile-up.
- `tests/auth.test.js` — auth-flow tests (Supabase email+password: signup
  validation, login, GoTrue session events incl. TOKEN_REFRESHED/SIGNED_OUT,
  error mapping via `authErrorMessage()`) against a controllable Supabase stub.

**Always run all four suites after changing logic or DOM.** Add a test when you
add a feature.

Unit tests are not sufficient evidence on their own — every bug the owner has
reported passed them. Before calling anything done, follow `.claude/skills/qa/`
(`SKILL.md` for the protocol, `harness.js` for the browser pass):

```bash
cd tests && npm test              # 4 suites, jsdom
node .claude/skills/qa/harness.js # real Chromium, real clicks, real reloads
```

## Changelog

`CHANGELOG.md` is the owner-facing record: what changed and why it mattered, in
plain language, newest first. **Add an entry in the same PR as any change the
owner would notice** — a new feature, a fixed bug they reported, a behaviour
change. Skip it for refactors, tests and tooling. Merged PR bodies are the
engineering detail; the changelog is the readable history.

## Deploy

GitHub Pages serves `index.html` from `main`. To ship a change:

```bash
git add index.html && git commit -m "describe change" && git push
```

Pages rebuilds in ~1 minute. Hard-refresh (Cmd+Shift+R) to clear cache. There is
no longer a numbered-download step — edit `index.html` directly.

## Gotchas

- **Never test via `file://`.** Google Maps and Supabase auth assume the deployed
  origin; on `file://` the script can throw during init and disable handlers that
  are bound near the end of the script (this previously made the Clear button
  look broken). Test on the live URL or a local server (`python3 -m http.server`).
- Client-side keys: the Supabase anon key is public by design (RLS is the real
  protection); the Google Maps key must be HTTP-referrer restricted.
- User-entered text (addresses, purpose, rule fields) must go through `esc()`
  before being rendered via `innerHTML`; CSV cells must go through `csvCell()`.

## Roadmap

- [x] ~~Commute exemption~~ (removed by owner decision — see Deductibility)
- [x] Auto-classify rules
- [x] Modernized analytics charts
- [x] Offline-capable PWA (service worker, manifest, offline trip sync-on-reconnect)
- [x] Tax-ready PDF reports (audit-defensible IRS export)
- [x] Invite a coworker (referral link; groundwork for a rewards system)
- [ ] Receipt capture (photo attached to a trip)
- [x] Persist auto-classify rules to Supabase (`user_prefs`)
- [x] Duplicate review + idempotent sync

Deferred: Capacitor native wrap (iOS/Android + auto-detect), native mobile app, paid tiers, marketing landing page.
