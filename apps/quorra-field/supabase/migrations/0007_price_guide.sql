-- Local price guide: the state the business works in (used to adjust national price ranges).
alter table public.business add column if not exists state text;
grant insert (state) on public.business to authenticated;
grant update (state) on public.business to authenticated;
