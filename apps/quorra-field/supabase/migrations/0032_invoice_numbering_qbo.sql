-- Invoice numbering start, and a fingerprint so edited invoices can be updated in QuickBooks.
alter table public.business add column if not exists invoice_next integer;
grant update (invoice_next) on public.business to authenticated;
alter table public.invoices add column if not exists qbo_hash text;
