-- One 14-day trial per email, card fingerprint, or Stripe customer.
-- Rows stay after the login is deleted, so deleting the company does not open another trial.
-- The service role (signup and billing functions) is the only writer.

create table if not exists public.trial_ledger (
  kind text not null check (kind in ('email', 'card', 'customer')),
  value text not null,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);

alter table public.trial_ledger enable row level security;
revoke all on table public.trial_ledger from public, anon, authenticated;

insert into public.trial_ledger (kind, value, stripe_customer_id)
select 'email', lower(btrim(u.email)), s.stripe_customer_id
from auth.users u
join public.subscriptions s on s.owner_id = u.id
where u.email is not null
  and btrim(u.email) <> ''
  and (s.trial_used_at is not null or s.stripe_subscription_id is not null or s.card_fingerprint is not null)
on conflict (kind, value) do nothing;

insert into public.trial_ledger (kind, value, stripe_customer_id)
select 'card', s.card_fingerprint, s.stripe_customer_id
from public.subscriptions s
where s.card_fingerprint is not null and btrim(s.card_fingerprint) <> ''
on conflict (kind, value) do nothing;

insert into public.trial_ledger (kind, value, stripe_customer_id)
select 'customer', s.stripe_customer_id, s.stripe_customer_id
from public.subscriptions s
where s.stripe_customer_id is not null and btrim(s.stripe_customer_id) <> ''
on conflict (kind, value) do nothing;

-- True when this email, card, or Stripe customer has already had a trial or a subscription.
create or replace function public.trial_is_used(p_email text, p_card text, p_customer text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trial_ledger t
    where (nullif(lower(btrim(coalesce(p_email, ''))), '') is not null
           and t.kind = 'email' and t.value = lower(btrim(p_email)))
       or (nullif(btrim(coalesce(p_card, '')), '') is not null
           and t.kind = 'card' and t.value = btrim(p_card))
       or (nullif(btrim(coalesce(p_customer, '')), '') is not null
           and t.kind = 'customer' and t.value = btrim(p_customer))
  );
$$;

revoke all on function public.trial_is_used(text, text, text) from public, anon, authenticated;
grant execute on function public.trial_is_used(text, text, text) to service_role;

-- Records the email, card, and customer. Returns true only when none of them were already recorded.
create or replace function public.claim_trial(p_email text, p_card text, p_customer text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  card text := nullif(btrim(coalesce(p_card, '')), '');
  customer text := nullif(btrim(coalesce(p_customer, '')), '');
  seen boolean;
begin
  if customer is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('quorra-trial'), hashtext(customer));
  if email is not null then
    perform pg_advisory_xact_lock(hashtext('quorra-trial-email'), hashtext(email));
  end if;
  if card is not null then
    perform pg_advisory_xact_lock(hashtext('quorra-trial-card'), hashtext(card));
  end if;

  seen := exists (
    select 1 from public.trial_ledger t
    where (email is not null and t.kind = 'email' and t.value = email)
       or (card is not null and t.kind = 'card' and t.value = card)
       or (t.kind = 'customer' and t.value = customer)
  );

  insert into public.trial_ledger (kind, value, stripe_customer_id)
  values ('customer', customer, customer)
  on conflict (kind, value) do nothing;
  if email is not null then
    insert into public.trial_ledger (kind, value, stripe_customer_id)
    values ('email', email, customer)
    on conflict (kind, value) do nothing;
  end if;
  if card is not null then
    insert into public.trial_ledger (kind, value, stripe_customer_id)
    values ('card', card, customer)
    on conflict (kind, value) do nothing;
  end if;

  return not seen;
end $$;

revoke all on function public.claim_trial(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_trial(text, text, text) to service_role;

-- Drops a claim when the Stripe subscription was not created, so a failed signup can be retried.
-- Only rows stored for this customer id are removed. Another account's email or card stays.
create or replace function public.release_trial_claim(p_customer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trial_ledger where stripe_customer_id = nullif(btrim(coalesce(p_customer, '')), '');
end $$;

revoke all on function public.release_trial_claim(text) from public, anon, authenticated;
grant execute on function public.release_trial_claim(text) to service_role;

notify pgrst, 'reload schema';
