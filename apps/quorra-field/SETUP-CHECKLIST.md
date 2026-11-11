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

## Limits
Tap to Pay on a real card needs a release build. Stripe blocks Tap to Pay on debuggable apps, so the android-test assembleDebug APK can never take a real tap. Use a release build, or set VITE_TERMINAL_SIMULATED=1 for a simulated reader. iOS Tap to Pay stays off until the ios-release environment sets TAP_TO_PAY_IOS=1 and VITE_TAP_TO_PAY_IOS=1, after Apple enables the proximity-reader capability. Google Calendar's phone app cannot subscribe from a link; Apple Calendar can (webcal).

## Sign-in captcha
The Free Supabase plan can use Cloudflare Turnstile. In the Supabase dashboard, turn on Captcha with a Turnstile secret. Set VITE_TURNSTILE_SITE_KEY for the app build. The sign-in form then shows the widget and the login function sends the token to Auth. Until that key is set, the widget is hidden. Direct calls to /auth/v1/token are still only limited by Supabase Auth's own rate limits. The Password Verification Attempt hook, which would lock that endpoint too, needs the Teams or Enterprise plan.
