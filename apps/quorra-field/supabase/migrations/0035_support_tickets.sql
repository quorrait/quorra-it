-- Support requests sent from inside the app. Written by the support-request function (service role); read by the Hub.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  user_email text,
  business_name text,
  category text not null default 'question',
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
