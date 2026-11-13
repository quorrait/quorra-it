-- Production already has no client grants on cancel_requests. 0021 creates
-- the table, and a fresh database would grant it to anon and authenticated.
-- Revoking those grants matches production. Revoking grants that are already
-- gone does not change production.

revoke all on table public.cancel_requests from anon, authenticated;
