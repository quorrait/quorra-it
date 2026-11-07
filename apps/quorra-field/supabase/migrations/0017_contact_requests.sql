-- Requests from the public "Contact us" form. Only the contact-request function (service role) writes here.
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  best_way text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);
alter table public.contact_requests enable row level security;
