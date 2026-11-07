-- How long before a visit the customer and the team are reminded (0 = off), plus per-recipient "already sent" marks.
alter table public.business add column if not exists reminders jsonb not null default '{}'::jsonb;
grant update (reminders) on public.business to authenticated;
alter table public.jobs add column if not exists customer_reminded_at timestamptz;
alter table public.jobs add column if not exists team_reminded_at timestamptz;
notify pgrst, 'reload schema';
