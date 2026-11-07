-- Remember whether the subscription is still in its free trial, so Billing can say so.
alter table public.subscriptions add column if not exists trialing boolean not null default false;
