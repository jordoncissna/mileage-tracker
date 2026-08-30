# Milo plans — a proposal

Status: **proposal only.** Nothing in here is built, and no feature is gated
today. Written while you were away so you have something concrete to react to
rather than a blank page. The numbers are arguable; the principles are the part
worth arguing about first.

---

## The one principle I'd hold to

**Never gate the things that decide whether an audit goes well.**

Your trips, your export, your tax report, and getting your data out are not
features — they're the user's own records. Putting a paywall between someone
and their IRS substantiation is the kind of thing that gets written about, and
it would make Milo untrustworthy in exactly the moment it matters most. If
someone stops paying, they should still be able to open the app, read every
trip, and download a complete report.

Charge for **convenience, scale and insight**. Not for safety.

## What actually costs you money

This matters more than it looks, because it decides where the free tier ends.

| Cost | Who bears it | Notes |
|---|---|---|
| Supabase (Postgres + auth) | You | Free tier is generous; trips are tiny rows. Not the constraint. |
| **Google Places autocomplete** | **You, per keystroke session** | Every address suggestion is a billable request. Heavy users are a real line item. |
| **Google Directions** | **You, per calculation** | Every "Calculate distance" and every map route draw. |
| Google Maps tiles | You, per load | Map-heavy views cost more than list views. |
| GitHub Pages hosting | Free | Static file. |

So the honest shape of a free tier isn't "fewer trips" — storing trips is nearly
free. It's **fewer paid API calls**. A free user who types 40 trips a month by
hand costs you almost nothing. One who uses address autocomplete and Calculate
distance for every trip costs real money.

That points at a cleaner free tier than the usual "10 trips a month" trap.

## Proposed tiers

### Free — "Enough to actually use it"
- Unlimited trips, unlimited history, unlimited devices
- CSV export and the full tax report (**never gated** — see the principle)
- Manual entry, round trips, multi-stop, repeat dates
- **25 address lookups and 25 distance calculations a month**, then the fields
  still work, you just type the address and the miles yourself
- One vehicle

*Why:* someone can run their whole tax year on Free and be genuinely safe. What
they give up is typing convenience, which is exactly what costs you per call.

### Pro — **$5/month or $48/year**
- Unlimited address lookups and distance calculations
- Auto-classify rules (already built, currently free)
- Duplicate review, the unlogged-day nudge, saved routes
- Multiple vehicles with separate rates
- Receipt photos attached to trips *(not built yet)*

*Why $5:* it has to be obviously less than the deduction it protects. One
81-mile round trip is worth ~$57 at the 2026 rate. Pro paying for itself in the
first recovered trip of the year is an easy sentence to say, and true.

### Premium — **$12/month or $115/year**
- Everything in Pro
- **Automatic trip detection** *(the native app — not built, and the honest
  reason this tier can't launch yet)*
- Multi-user: invite your team, see everyone's log, one export for the business
- Quarterly estimated-tax summaries and a year-end packet for your accountant
- Priority support

*Why:* Premium should be for people whose time is worth more than the price —
and auto-tracking is the only feature here that genuinely buys back time.
**Don't launch Premium until that exists.** Selling it on multi-user alone
invites the comparison to MileIQ at $5.99/mo, and you'd lose it.

## The referral reward — my recommendation

You asked: bill credit, or unlock Pro/Premium for a month?

**Unlock a month. Not credit.** Three reasons:

1. **Credit only works if they're already paying.** Most people you invite will
   be on Free, so a bill credit is worth nothing to them and rewards nobody. A
   free month of Pro is valuable to *everyone*, which makes the ask shareable.
2. **It's a product demo, not a discount.** A free month puts someone inside the
   paid tier, where they either form the habit or don't. Credit just makes a
   number smaller on a card statement they don't look at.
3. **It costs you almost nothing.** A month of Pro is a few dollars of Google
   API calls, not $5 of real margin.

**Proposed mechanic — both sides win:**

> Share your link. When someone signs up and logs their first trip, you both get
> **one month of Pro, free**. Up to 6 months a year.

Requiring a first logged trip — not just a signup — is what stops the obvious
gaming, and it's a low enough bar to feel fair. The annual cap keeps a
determined sharer from getting Pro free forever without you deciding to let them.

## What it would take to build

In order, because each depends on the one before it.

1. **Referral attribution** — the invite link already carries `?ref=<code>`, but
   **nothing reads it today**. Attribution has to be captured at page load
   (before signup) and written at signup, or the reward can never be counted.
   *Note:* the code is currently the raw Supabase user id. That leaks an
   internal identifier into a link people paste into group chats; it should be a
   short random code stored against the account instead.
2. **An entitlements table** — `plan`, `plan_expires_at`, `granted_by`. One row
   per user, RLS the same shape as `user_prefs`. Read on sign-in.
3. **A gating layer** — one function, `can('feature')`, consulted by the few
   features that are gated. Everything else stays open, so the paywall can never
   creep into the export or the report by accident.
4. **Billing** — Stripe Checkout plus a webhook to set `plan`. This needs a
   Stripe account, keys, and a server endpoint; GitHub Pages can't receive a
   webhook, so it wants a Supabase Edge Function.
5. **Only then**, the referral grant: count referrals, extend `plan_expires_at`.

Steps 1–3 are safe to build any time and change nothing for you. Step 4 is where
this stops being a side project and starts being a business with support
obligations, refunds and tax on revenue.

## What I deliberately did not do

I didn't build any of this while you were away. Shipping a paywall on a live app
without you there to say "not that one, not at that price" is not a decision I
should make on your behalf — and gating something you use daily could have
locked you out of your own trips. The UX work I did ship this session is all
additive.

## What only you can answer

1. **Is Milo a product or a tool?** Everything above assumes you want paying
   strangers. If it's for you and a handful of coworkers, skip all of it — the
   invite link and a free app are enough, and you save yourself the support load.
2. **Are you prepared to support paying customers?** Refunds, "it lost my trip",
   tax on revenue, a real privacy posture. That's the actual cost of Pro, not the
   engineering.
3. **Does auto-tracking happen?** Premium is thin without it, and it needs the
   Apple Developer enrollment that's been outstanding.
4. **Free tier limit — 25 lookups a month?** I picked a number that felt
   generous for a light user. It's worth checking against your own usage: you'd
   know within a month whether it pinches.
