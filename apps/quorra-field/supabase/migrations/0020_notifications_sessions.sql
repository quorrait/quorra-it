-- Who gets told when something is booked or moved, the in-app notification feed, and one-device-at-a-time sign-in.
alter table public.business add column if not exists notify_email text not null default '';
alter table public.business add column if not exists notify_phone text not null default '';
grant update (notify_email, notify_phone) on public.business to authenticated;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  link text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists notifications_owner_idx on public.notifications (owner_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "account notifications" on public.notifications;
create policy "account notifications" on public.notifications for select using (owner_id = public.account_id());

create table if not exists public.user_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.user_sessions enable row level security;
drop policy if exists "own session" on public.user_sessions;
create policy "own session" on public.user_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Paid jobs from before the Completed tab existed
update public.leads l set stage = 'completed'
 where l.stage = 'work_order' and exists (select 1 from public.jobs j where j.id = l.job_id and j.status = 'completed');
notify pgrst, 'reload schema';
