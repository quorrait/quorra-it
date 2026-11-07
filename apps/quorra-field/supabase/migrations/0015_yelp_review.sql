alter table public.business add column if not exists yelp_url text not null default '';
grant update (yelp_url) on public.business to authenticated;
notify pgrst, 'reload schema';
