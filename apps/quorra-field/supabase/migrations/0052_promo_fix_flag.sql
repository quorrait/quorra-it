-- The launch promo schedule is written after the trial subscription exists.
-- If Stripe rejects that write twice, keep the failure on the subscription so
-- the Hub can show it and someone can fix the schedule by hand.
-- Service role writes this. Owners can already read their own subscription row.

alter table public.subscriptions
  add column if not exists promo_fix_needed boolean not null default false,
  add column if not exists promo_fix_detail text;

comment on column public.subscriptions.promo_fix_needed is
  'True when the post-trial launch promo could not be scheduled after one retry.';
comment on column public.subscriptions.promo_fix_detail is
  'Stripe error from the failed promo schedule, for the Hub.';
