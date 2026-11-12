# Setup checklist (things only you can do)

## 1. SQL (Supabase, SQL Editor, run each once)
`migrations/0014` timesheet edits, `0015` yelp link, `0016` vendors / pay period / hours, `0017` contact requests, `0018` paid jobs complete, `0019` reminders.

## 2. Functions (Dashboard or `supabase functions deploy <name> --no-verify-jwt`)
Verify JWT **off**: portal-view, portal-pay, quote-view, quote-respond, lead-intake, calendar-feed, contact-request, send-reminders, stripe-webhook, billing-webhook.
Verify JWT **on**: send-invite, billing-checkout, billing-portal, create-checkout.

## 3. Secrets (Edge Functions, Secrets)
- Email: `RESEND_API_KEY`, `FROM_EMAIL` (resend.com; verify your domain). Needed for invites, contact form, reminders, booking emails.
- Text: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (twilio.com; US numbers need A2P 10DLC registration before texts deliver).
- `APP_URL`, `SUPPORT_EMAIL` (optional; support mail defaults to support@quorrait.com), `CRON_SECRET` (any long random string).
- Cards: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus plan prices `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_ESSENTIALS`, `STRIPE_PRICE_ENTERPRISE`.

## 4. Hourly reminders (SQL Editor)
```sql
create extension if not exists pg_cron; create extension if not exists pg_net;
select cron.schedule('send-reminders', '0 * * * *', $$
  select net.http_post('https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'));
$$);
```

## 5. Stripe
Webhook endpoints: `stripe-webhook` (customer card payments) and `billing-webhook` (plan signups; events customer.subscription.*, checkout.session.completed). Create the three plan prices and put their IDs in the secrets above. Plan signups then flow Billing > Checkout > webhook > subscription active.

Connected accounts endpoint for `stripe-webhook` (Events from: Connected accounts): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `account.updated`. Keep `account.updated` so existing v1 accounts, and v2 accounts, still set Connected.

Add a second endpoint on the same `stripe-webhook` URL with Events from: Your account, event `v2.core.account[configuration.merchant].capability_status_updated`. Put that endpoint's signing secret in `STRIPE_CONNECT_V2_WEBHOOK_SECRET`. v2 capability events cannot be added to the Connected accounts endpoint. Apply migration `0052` before deploying `billing-webhook`, `signup-complete`, and `hub`.

## Limits
Tap to Pay and Square swipe need a native app / Square account; the web app uses Stripe checkout (QR, link, Apple/Google Pay). Google Calendar's phone app cannot subscribe from a link; Apple Calendar can (webcal).
