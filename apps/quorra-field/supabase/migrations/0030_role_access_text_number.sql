-- Owner-controlled screen access per role, and the business texting number shown in Settings.
alter table public.business add column if not exists role_access jsonb;
alter table public.business add column if not exists text_number text not null default '';
grant update (role_access, text_number) on public.business to authenticated;
