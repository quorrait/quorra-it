-- Flag a customer (caution or do not serve) with a note about what happened.
alter table public.customers add column if not exists flag text not null default '';
alter table public.customers add column if not exists flag_note text not null default '';
notify pgrst, 'reload schema';
