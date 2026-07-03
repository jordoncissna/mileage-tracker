# Milo email templates

Two templates, plus a suggested sequence. Auth email delivery already runs
through **Resend SMTP via Supabase** — no new infrastructure is needed for the
first one.

## 1. `confirm-signup.html` — the welcome/confirmation email (install now)

This is the first email every new user gets, seconds after signup. Install it:

1. Supabase Dashboard → **Authentication → Email Templates → Confirm signup**
2. Set the subject to: `Welcome to Milo — confirm your email`
3. Paste the contents of `confirm-signup.html` into the message body
   (keep `{{ .ConfirmationURL }}` intact — Supabase fills it in).
4. Send yourself a test signup to verify rendering.

## 2. `welcome.html` — the day-0/1 welcome email (after confirmation)

Supabase doesn't send a "welcome" email natively; two ways to send this one:

- **Manual/low volume:** Resend Dashboard → Broadcasts → paste `welcome.html`,
  send to new signups (export emails from Supabase → Authentication → Users).
- **Automatic:** a Supabase Edge Function on the `auth.users` insert/confirm
  event that POSTs to Resend's API (`https://api.resend.com/emails`) with this
  HTML. Keep the Resend API key in Supabase secrets, never in the client.

Per deliverability best practice: send it **from a real person's address**
(e.g. `Jordon at Milo <jordon@…>`), not `noreply@`, and make replies land in a
monitored inbox.

## Suggested sequence (industry-standard cadence)

| When | Email | Goal |
|---|---|---|
| Instant | Confirm signup (template 1) | Activate the account |
| Day 0–1 | Welcome (template 2) | First trip logged |
| Day 3 | "Set Home & Office" tip | Commute detection configured |
| Day 7 | "Your week in miles" nudge | Habit + Analytics discovery |
| Tax season | Year-end recap | Export/report usage |

Keep each email focused on **one action**, single column, ≥14px body text.
