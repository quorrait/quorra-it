-- Reminder bookkeeping so nobody is texted twice.
alter table public.jobs add column if not exists reminder_sent_at timestamptz;
alter table public.service_plans add column if not exists reminder_sent_at timestamptz;
notify pgrst, 'reload schema';
