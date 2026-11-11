-- Stripe Terminal location for Tap to Pay, on the contractor's connected account.
-- The edge functions (service role) write this. The app does not.
alter table public.business add column if not exists terminal_location_id text;
