alter table public.time_entries add column if not exists overtime_minutes integer not null default 0;
alter table public.time_entries add column if not exists edits jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
