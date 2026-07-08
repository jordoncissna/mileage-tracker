# Milo — IRS-Auditable Mileage Tracker

Milo is a single-file web app for logging business vehicle trips and producing
deduction-ready records that stand up to IRS substantiation rules. It runs as a
progressive web app (installable on iPhone via **Share → Add to Home Screen**)
and syncs to a Supabase backend so trips are available across devices and can be
shared with an accountant.

**Live:** https://jordoncissna.github.io/mileage-tracker

---

## What it does

- **Trip logging** with Google Places autocomplete and automatic distance
  calculation between a From and To address.
- **Standard mileage rates** applied automatically by trip year (2023–2026 built
  in) to compute each trip's deductible value.
- **Commute exemption** — auto-flags Home ↔ Office trips and excludes them from
  deduction totals, per IRS §262 (commuting is personal, non-deductible). Manual
  override available per trip.
- **Auto-classify rules** — define rules like *"trips to 456 Business Ave →
  Office Visit"* matched on From address, To address, and/or a purpose keyword.
  Matching trips get a suggestion you confirm; nothing is auto-applied silently.
- **Personal (non-deductible) category** — exclude personal trips from totals
  while keeping them on the log.
- **Analytics** — year-to-date totals, prior-year comparison, top destinations,
  day-of-week distribution, cost-per-trip, and an annualized projection.
- **CSV export / import** — back up or hand a clean, columned export to your
  accountant; re-import to restore.
- **Resizable Route column** — drag the Route column header wider to read full
  addresses; the width is remembered.

## IRS substantiation basis

Milo is structured around the records the IRS expects for a vehicle deduction:

- **§162** — ordinary and necessary business expense.
- **§274(d)** — contemporaneous substantiation: date, mileage, destination, and
  business purpose for each trip (the exact fields Milo records).
- **§262** — commuting between home and a regular workplace is personal and
  non-deductible (handled by the commute exemption).

Milo produces records and is not tax advice. Confirm treatment with a tax
professional before filing.

## Tech stack

- **Frontend:** single self-contained `index.html` (HTML/CSS/vanilla JS, no build
  step).
- **Maps & distance:** Google Maps JavaScript API (Places + Geometry).
- **Backend:** Supabase (Postgres + Auth) with row-level security.
- **Auth email:** Resend SMTP.
- **Hosting:** GitHub Pages.

## Project structure

This is intentionally a **single file**. Everything — markup, styles, and
application logic — lives in `index.html`. Working copies are downloaded and
versioned locally as `mileage-tracker_NN.html` before being promoted to
`index.html` for deploy.

## Data model

**Supabase `trips` table**

| column        | notes                                   |
| ------------- | --------------------------------------- |
| `id`          | primary key                             |
| `user_id`     | owner (scoped by RLS)                   |
| `date`        | trip date                               |
| `miles`       | distance                                |
| `from_addr`   | origin address                          |
| `to_addr`     | destination address                     |
| `purpose`     | business purpose                        |
| `category`    | classification (incl. Personal)         |
| `coords`      | route geometry (optional)               |
| `from_latlng` | origin coordinates (optional)           |
| `to_latlng`   | destination coordinates (optional)      |

**Local settings** (`localStorage`, per device): mileage rates, business info,
home/office addresses, commute toggles, auto-classify rules, remembered Route
column width.

## Configuration

The client expects:

- A **Google Maps API key** (in the Maps script tag). Restrict it by HTTP
  referrer to the GitHub Pages origin to prevent key abuse.
- A **Supabase project URL and anon key**. The anon key is public by design;
  data isolation depends entirely on row-level security policies being correct.
- **Resend** configured in Supabase Auth for verification emails (free tier:
  3,000/month).

## Local development

Because the app relies on Google Maps referrer rules and Supabase auth redirect
URLs, it behaves most reliably when served from the deployed origin. Opening the
file directly with `file://` works for UI/logic checks but may break Maps and
auth. For local serving:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deployment

Promote the latest downloaded build to `index.html` and push:

```bash
cp "$(ls -t ~/Downloads/mileage-tracker_*.html | head -1)" ~/Documents/milo-github/index.html && \
cd ~/Documents/milo-github && \
git add index.html && \
git commit -m "Describe the change" && \
git push
```

GitHub Pages rebuilds within ~1 minute. Hard-refresh (Cmd+Shift+R) to clear
cache.

## Roadmap

- [x] Commute exemption (§262)
- [x] Auto-classify rules
- [x] Offline-capable PWA (works without signal; trips sync on reconnect)
- [x] Tax-ready PDF reports (audit-defensible IRS export)
- [x] Invite a coworker (referral link; groundwork for a rewards system)
- [ ] Receipt capture (photo attached to a trip)

Deferred: Capacitor native wrap (iOS/Android + auto-detect), native mobile app, paid tiers, marketing landing page.

## Security notes

Before charging users, confirm: row-level security policies fully isolate each
user's trips; the Google Maps key is referrer-restricted; and any payment flow
uses a hosted processor (e.g. Stripe Checkout) so card data never touches the
app. A Privacy Policy and Terms of Service are typically required by payment
processors before accepting payments.

---

*Milo is a project of Ridgeline Management Group LLC.*
