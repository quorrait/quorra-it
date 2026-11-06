-- Invoice notes/terms and the business mailing address shown on invoices.
alter table public.invoices add column if not exists notes text not null default '';
alter table public.business add column if not exists address text not null default '';
grant insert (address) on public.business to authenticated;
grant update (address) on public.business to authenticated;
