-- Time on the job: when work started and how long it actually took (quoted time is the scheduled duration).
alter table public.jobs add column if not exists started_at timestamptz;
alter table public.jobs add column if not exists actual_minutes int check (actual_minutes is null or actual_minutes >= 0);
