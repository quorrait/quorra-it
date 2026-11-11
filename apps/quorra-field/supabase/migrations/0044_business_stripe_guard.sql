-- Matches the Stripe-column guard applied directly in Supabase. Do not run this again if that trigger is already there.
-- Authenticated users cannot set or change the connected-account fields. Edge functions use the service role and still can.
create or replace function public.protect_business_stripe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.stripe_account_id := null;
    new.stripe_connected := false;
    new.terminal_location_id := null;
  else
    new.stripe_account_id := old.stripe_account_id;
    new.stripe_connected := old.stripe_connected;
    new.terminal_location_id := old.terminal_location_id;
  end if;
  return new;
end $$;
drop trigger if exists business_protect_stripe on public.business;
create trigger business_protect_stripe
  before insert or update on public.business
  for each row execute function public.protect_business_stripe();
