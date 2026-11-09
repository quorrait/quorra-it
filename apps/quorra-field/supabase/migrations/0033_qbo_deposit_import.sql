-- Where QuickBooks payments are deposited, and when the first import from QuickBooks ran.
alter table public.business add column if not exists qbo_deposit_account text;
alter table public.business add column if not exists qbo_deposit_name text;
alter table public.business add column if not exists qbo_imported_at timestamptz;
grant update (qbo_deposit_account, qbo_deposit_name) on public.business to authenticated;
