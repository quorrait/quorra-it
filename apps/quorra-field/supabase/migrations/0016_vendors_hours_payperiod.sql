-- Preset vendors, pay period, and open hours (used by customer scheduling).
alter table public.business add column if not exists vendors jsonb not null default '[]'::jsonb;
alter table public.business add column if not exists pay_period jsonb not null default '{}'::jsonb;
alter table public.business add column if not exists hours jsonb not null default '{}'::jsonb;
grant update (vendors, pay_period, hours) on public.business to authenticated;
notify pgrst, 'reload schema';
