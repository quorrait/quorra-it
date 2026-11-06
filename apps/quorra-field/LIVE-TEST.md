# Live test account (about 15 minutes)

1. **Create a project** at supabase.com (free tier is fine). Name it `quorra-dispatch-test`.
2. **Database:** SQL Editor, paste all of `supabase/setup-all.sql`, Run. (It runs the 7 migrations in order. Checked on Postgres 16 with no errors.)
3. **Auth:** Authentication, Providers, Email: turn off "Confirm email" so test sign-ups work instantly.
4. **Keys:** Project Settings, API. Copy the Project URL and the `anon` public key.
5. **Build the live app:** send those two values (they are public by design) and it gets built at `/field-test/`. Or locally: copy `.env.example` to `.env`, fill them in, `npm run dev`.
6. **Sign up** in the live app with a throwaway email.
7. **Fake data:** SQL Editor, open `supabase/seed-test-data.sql`, change the email on the `v_email` line to the one you signed up with, Run. Reload the app. Re-running resets the test data.
8. **Forms, quote links and calendar feed** need the functions deployed (the CLI is the only step that needs your login):
   ```
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase functions deploy lead-intake quote-view quote-respond calendar-feed --no-verify-jwt
   ```
   Stripe and QuickBooks are optional and can wait.

Then test: Settings, Website lead form (open the link, submit, watch it land in Leads), a quote's "View and accept" link, and Settings, Phone calendar sync (Add to phone calendar).
