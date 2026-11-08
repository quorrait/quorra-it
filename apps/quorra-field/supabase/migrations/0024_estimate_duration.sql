-- How long the job takes, set on the estimate so online booking blocks the right amount of time. 0 = use the business default.
alter table public.estimates add column if not exists duration_min int not null default 0;
notify pgrst, 'reload schema';
