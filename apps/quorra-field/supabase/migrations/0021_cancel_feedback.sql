-- Why people cancel, and whether they want a call back. Written by the cancel-feedback function.
create table if not exists public.cancel_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text not null default '',
  business text not null default '',
  reason text not null,
  details text not null default '',
  contact_me boolean not null default false,
  phone text not null default '',
  created_at timestamptz not null default now()
);
alter table public.cancel_requests enable row level security;
notify pgrst, 'reload schema';
