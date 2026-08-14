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
- **Auth email:** Resend SMTP via Supabase.

## Data model

**Supabase `trips` table:** `id`, `user_id`, `date`, `miles`, `from_addr`,
`to_addr`, `purpose`, `category`, `coords`, `from_latlng`, `to_latlng`.

**Local trip object:** `{ id, date, miles, from, to, purpose, category, coords,
fromLatLng, toLatLng, supaId, isCommute? }`. Note `isCommute` (manual override)
is **local only** — it is not persisted to Supabase yet.

**Categories:** Office Visit, Blockchain Work, Team Meeting, Client Meeting,
Business Errand, Conference / Event, Bank / Finance, Office Supplies, Other
Business, Personal (Non-deductible).

**Deductibility:** `deductibleValue()` / `deductibleMiles()` return 0 only for
category `Personal (Non-deductible)`. The commute concept was REMOVED by owner
decision (isCommute() always returns false; legacy cfg flags are forced off on
load) — every logged trip is a business write-off. `addrMatches()` /
`normalizeAddr()` survive for Home/Office labels and saved-route matching.

**Round trips are ONE line item:** the round-trip toggle doubles the trip's
miles (or uses the Maps round distance) instead of logging a separate return
trip; in multi-stop batches the return distance folds into the last leg.

## Key functions (search these names in index.html)

- `addTrip()` — create a trip from the entry form (builds `from`/`to` from the
  visible street/city/state fields via `buildAddr()`).
- `clearF()` — reset the entry form.
- `renderH()` — render the history table.
- `renderAnalytics()` — render hero stats, the SVG period chart, category bars.
- `suggestFor()` / `ruleMatches()` — auto-classify rules engine (suggest-and-confirm).
- `saveToSupabase()` / `updateTripInSupabase()` — sync.

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
- `tests/auth.test.js` — auth-flow tests (Supabase email+password: signup
  validation, login, GoTrue session events incl. TOKEN_REFRESHED/SIGNED_OUT,
  error mapping via `authErrorMessage()`) against a controllable Supabase stub.

**Always run both suites after changing logic or DOM.** Add a test when you add
a feature.

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
- [ ] Persist auto-classify rules to Supabase (currently local only)

Deferred: Capacitor native wrap (iOS/Android + auto-detect), native mobile app, paid tiers, marketing landing page.
