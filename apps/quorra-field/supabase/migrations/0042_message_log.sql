-- Daily send cap for quotes and invoices. Written by send-document (service role). Not applied from this repo.
create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists message_log_owner_day on public.message_log (owner_id, created_at);
alter table public.message_log enable row level security;
revoke all on public.message_log from anon, authenticated;
