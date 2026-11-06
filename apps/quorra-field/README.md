# Quorra Dispatch

Field-service app for trades (HVAC, plumbing, electrical, construction): dashboard with money earned today / this week / this month, a calendar tied to jobs, invoices, card payments from the phone, and QuickBooks Online sync. Mobile-first PWA (installs to the home screen), React + TypeScript + Supabase.

Name is a placeholder: change `APP_NAME` in `src/lib/config.ts` (plus `index.html` and `public/manifest.webmanifest`).

## Run it now (demo mode)

```bash
npm install
npm run dev
```

With no `.env`, the app runs in **demo mode**: any email logs in, a month of sample jobs/invoices/payments is generated, and everything saves in the browser. Card payment shows a simulated checkout. Good for showing contractors.

## Go live

### 1. Supabase (database + logins + functions)
1. Create a project at supabase.com. Copy the project URL and anon key into `.env` (see `.env.example`).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. `npm i -g supabase`, then `supabase login` and `supabase link --project-ref <ref>`.

### 2. Stripe (card payments)
Uses Stripe Connect **Standard** accounts: each contractor connects their own Stripe account, so money goes straight to them.
1. Enable Connect in your Stripe dashboard.
2. Add a webhook endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` listening to **events on Connected accounts**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`.
3. Set secrets and deploy:
```bash
supabase secrets set APP_URL=https://your-app-domain STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy create-checkout stripe-connect-link
supabase functions deploy stripe-webhook --no-verify-jwt
```

### 3. QuickBooks Online
1. Create an app at developer.intuit.com with the `com.intuit.quickbooks.accounting` scope. Add redirect URI `https://<ref>.supabase.co/functions/v1/qbo-callback`.
2. Set secrets and deploy:
```bash
supabase secrets set QBO_CLIENT_ID=... QBO_CLIENT_SECRET=... QBO_STATE_SECRET=$(openssl rand -hex 32) QBO_ENV=sandbox
supabase functions deploy qbo-auth-url qbo-sync-invoice
supabase functions deploy qbo-callback --no-verify-jwt
```
3. Test against a sandbox company. To go to real customers, Intuit requires an app assessment (typically 1-3 weeks) and then `QBO_ENV=production`.

### 4. Deploy the front end
`npm run build` and host `dist/` on Cloudflare Pages, Netlify or Vercel with **single-page-app fallback** to `index.html`. Set `APP_URL` (above) to that address.

## How it works
- `src/lib/store.ts`: the backend interface. `demoStore.ts` (browser) and `supabaseStore.ts` (live) both implement it, so screens don't care which is running.
- Row level security: every row has an `owner_id`; users only see their own data. Payments can only be created by the `record_payment()` function (cash/check) or the Stripe webhook (card). Integration tokens live in a table with no client access.
- Invoice totals use the same math in the app, SQL and functions.

## Not done yet / known limits
- **The Stripe, QuickBooks and Supabase pieces have not been run against real accounts.** Everything was type-checked and the demo path was exercised, but expect to debug first contact with the live services.
- Tap to Pay on the phone itself needs a native app (Apple entitlement + app store review). This version uses a hosted checkout page plus QR code, so the customer pays with their own phone or yours, including Apple Pay / Google Pay.
- One login per business. Techs with their own logins/permissions, SMS reminders, estimates/quotes, photos, GPS, recurring jobs and offline job editing are next.
- QuickBooks: sales tax is sent as its own invoice line. Payments sync when you tap "Sync" on the invoice.


## Modules

Home dashboard (earnings + month calendar), Calendar, Jobs (with job profit), Invoices (card pay link, manual payments, QuickBooks sync), Customers, **Leads** pipeline, **Estimates** (approve, convert to job/invoice, print/PDF), **Price book**, **Service plans** (recurring visits), **Purchase orders**, **Team**, **Timesheets** (clock in/out, labor cost), **Reports** (collected, aging, revenue by tech, commission, CSV export), and a logo upload in Settings that prints on estimates.

Run `supabase/migrations/0002_modules.sql` after `0001_init.sql` to create these tables.

## Not built yet

Customer portal, separate logins/permissions for team members (everyone shares the owner's account), job photos/file storage, Tap to Pay (needs a native iOS/Android app), SMS/email sending from the app (estimates open your mail app), Stripe-fee reconciliation in QuickBooks.

## Roles

Owner and Manager see everything. Office, Sales and Technician see only what their job needs (Team, Timesheets, Reports, Settings and revenue are manager-only; technicians see only jobs assigned to them). Roles are matched by login email to the Team list; run `supabase/migrations/0003_manager_role.sql` to allow the Manager role.

Note: this hides screens in the app. Hard enforcement (so a technician can't read data by calling the database directly) needs a separate Supabase login per person and business-wide row security. That is the next step.

## Templates and imports

- **Templates:** saved estimate/invoice and job templates, plus a starter library (HVAC, Plumbing, Electrical, General construction) that adds standard price book items and ready-made templates. Pick a template when creating an estimate, invoice or job; use "Save as template" on any estimate or job. Run `supabase/migrations/0004_templates.sql` first.
- **Imports (CSV):** customers, price book, leads, jobs, team and past invoices, each with a downloadable template, automatic column matching, preview, duplicate skipping and a row-by-row error list. Imports run one record at a time, so very large files (thousands of rows) will be slow.
