-- Customer portal link per customer, and a review link per business.
alter table public.customers add column if not exists portal_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.customers set portal_token = replace(gen_random_uuid()::text, '-', '') where portal_token is null;
alter table public.business add column if not exists review_url text not null default '';
grant update (review_url) on public.business to authenticated;
