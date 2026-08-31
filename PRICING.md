# Milo plans — a proposal

**Nothing here is built.** No feature is locked, no one is charged, there's no
payment system. This is a document to argue with, not a plan already in motion.

Prices are guesses. The two rules at the top are the part that matters — get
those right and the numbers can move later.

---

## Rule 1: never lock someone out of their own tax records

Someone uses Milo all year and logs 300 trips. In January they cancel. In March
the IRS asks them to prove their vehicle deduction. They open Milo and see
*"Upgrade to Pro to export your trips."*

Now they can't defend themselves without paying you. Facts about their own
driving, that they typed in themselves, are being held back at the exact moment
they need them most. That's the version of this that ends up in angry reviews,
and it would deserve to.

So: **the CSV export and the tax report stay free forever, for everyone,
including people who cancelled.** Lose your subscription and you lose the
conveniences — address suggestions, distance calculation, auto-classify rules —
but you can always open the app, read every trip, and download a full report.

Charge people for saving them time. Never charge them for letting them out.

This costs you almost nothing in practice. Building a report is just arithmetic
on data you already store. The things that actually cost money are the
conveniences — which is exactly what's worth charging for.

## Rule 2: the free plan should be limited by what costs you money

Most apps cap the free plan at something like "10 trips a month". That's the
wrong lever here, because storing a trip costs you essentially nothing — it's a
few hundred characters in a database.

Here's where your money actually goes:

| What | Costs you? | Why |
|---|---|---|
| Storing trips (Supabase) | Nearly nothing | Free tier is generous, trips are tiny |
| **Address suggestions** | **Yes, every search** | Google charges per lookup |
| **Calculate distance** | **Yes, every click** | Google charges per route |
| Showing the map | Yes, per page load | Google charges per map |
| Hosting the app | Free | It's one file on GitHub Pages |

Someone who types 40 trips a month by hand costs you close to zero. Someone who
uses address search and Calculate distance on every trip costs you real money.

So cap the free plan on **lookups**, not trips. It's fairer, it matches your
actual bill, and it means nobody ever loses their records because they drove too
much.

## The three plans

### Free — genuinely usable
- Unlimited trips, unlimited history, all your devices
- CSV export and the full tax report — **always, no exceptions**
- Manual entry, round trips, multi-stop, repeat dates
- **25 address searches and 25 distance calculations a month.** After that the
  fields still work — you type the address and the miles yourself
- One vehicle

Someone can run an entire tax year on Free and be completely safe in an audit.
What they give up is typing convenience.

### Pro — **$5/month, or $48/year**
- Unlimited address searches and distance calculations
- Auto-classify rules
- Duplicate review, the unlogged-day reminder, saved routes
- More than one vehicle, each with its own rate
- Photos attached to trips *(not built yet)*

**Why $5:** it has to be obviously cheaper than what it protects. One 81-mile
round trip is worth about $57 in deduction. If Pro pays for itself the first
time it saves one forgotten trip, that's an easy and true thing to say.

### Premium — **$12/month, or $115/year**
- Everything in Pro
- **Automatic trip detection** *(the phone app — not built)*
- Your team: invite people, see everyone's log, one export for the business
- Quarterly tax estimates and a year-end package for your accountant
- Priority support

**Don't launch this until automatic tracking exists.** It's the only thing here
that genuinely buys someone time back. Without it you're asking $12 for team
features against MileIQ at $5.99, and you'd lose that comparison.

## The share reward

You asked whether to give people credit on their bill, or a free month of Pro.

**Give the free month.** Three reasons:

1. **Credit is worthless to most people you invite.** They're on Free — they
   have no bill. A discount on nothing rewards nobody. A free month of Pro is
   worth something to everyone, which is what makes people actually share.
2. **A free month is a demo, not a discount.** It puts someone inside the paid
   plan for 30 days, where they either get hooked or don't. Credit just makes a
   number smaller on a statement nobody reads.
3. **It barely costs you anything** — a month of Pro is a few dollars of Google
   lookups, not $5 of lost profit.

**How it would work:**

> Share your link. When someone signs up and logs their first trip, you both get
> a free month of Pro. Up to 6 months a year.

Requiring that first logged trip — not just a signup — is what stops people
creating fake accounts for free months. Six months a year is the ceiling, so
nobody rides it forever without you choosing to let them.

## What building this actually takes

Each step needs the one before it.

1. **Know who referred whom.** Your invite link already ends in `?ref=...`, but
   **nothing in the app reads it today**. Right now referrals can't be counted
   at all, so no reward is possible. This is the first thing to fix.
   *One problem to fix while doing it:* that code is currently your Supabase
   user ID — an internal identifier that shouldn't be in a link people paste
   into group chats. It should be a short random code instead.
2. **Remember who's on what plan.** A small table listing each person's plan and
   when it expires. Same privacy setup as the rules table you already ran.
3. **One place that decides what's unlocked.** A single function every paid
   feature asks before running. Keeping it in one place is what stops a paywall
   from accidentally creeping onto the export or the report later.
4. **Take payments.** Stripe, plus something that listens for "they paid" and
   updates the plan. GitHub Pages can't receive that message — it only serves
   files — so this needs a small piece of code running on Supabase.
5. **Then the referral reward** — count referrals, add a month.

Steps 1–3 are safe to build whenever and change nothing for you or anyone using
the app. **Step 4 is the real line.** Once you take money you have customers:
refunds, "your app lost my trip", sales tax on revenue, a privacy policy that
has to hold up. That's the actual cost of charging — not the code.

## What I didn't do

I didn't build any of this. Putting a paywall on a live app while you were away
isn't my call, and locking a feature you use every day could have locked you out
of your own trips.

One related thing I did fix: Settings showed a **PRO** badge on auto-classify
rules. There's no Pro plan and the feature is free, so anyone you invited saw a
"pay for this" hint on something they already had. Removed — put it back the day
paid plans actually exist.

## What only you can decide

1. **Is Milo a product, or your tool?** All of this assumes you want paying
   strangers. If it's for you and a few coworkers, skip the whole thing — the
   invite link and a free app are enough, and you save yourself the support
   burden entirely.
2. **Do you want customers?** Not "do you want revenue" — customers. People who
   email you when something breaks and expect an answer that day.
3. **Is the phone app happening?** Premium is thin without automatic tracking,
   and that still needs the Apple Developer signup you haven't done.
4. **Is 25 lookups a month right?** I picked a number that felt generous for
   someone logging a few trips a week. Watch your own usage for a month — you'll
   know quickly whether it pinches.
