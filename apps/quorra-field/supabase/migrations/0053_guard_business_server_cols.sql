-- Production guards server-managed business columns with guard_business_server_cols
-- and trigger business_server_cols. 0044 recorded a different pair
-- (protect_business_stripe / business_protect_stripe) that only covers the
-- Stripe fields and silently resets them. This puts a fresh database on the
-- production objects.
--
-- On production the function is replaced with the same definition, the revoke
-- is already in place, the 0044 objects are absent, and the trigger is left
-- untouched when it already exists.

create or replace function public.guard_business_server_cols()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only direct client writes (PostgREST as anon/authenticated) are restricted. Edge functions use the service role;
  -- SECURITY DEFINER RPCs (disconnect_qbo, reset_calendar_token) run as their owner, so both are unaffected.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.stripe_account_id := null;
      new.stripe_connected := false;
      new.terminal_location_id := null;
      new.qbo_connected := false;
      new.qbo_company := null;
    elsif new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_connected is distinct from old.stripe_connected
       or new.terminal_location_id is distinct from old.terminal_location_id
       or new.qbo_connected is distinct from old.qbo_connected
       or new.qbo_company is distinct from old.qbo_company
       or new.calendar_token is distinct from old.calendar_token then
      raise exception 'This setting is managed by the server';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.guard_business_server_cols() from public, anon, authenticated;

drop trigger if exists business_protect_stripe on public.business;
drop function if exists public.protect_business_stripe();

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'business_server_cols'
      and tgrelid = 'public.business'::regclass
      and not tgisinternal
  ) then
    create trigger business_server_cols
      before insert or update on public.business
      for each row execute function public.guard_business_server_cols();
  end if;
end $$;
