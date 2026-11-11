-- Sign-in lockout. The login edge function (service role) is the only writer.
-- A lock is per email, never per IP. anon and authenticated cannot read or write this table.

create table if not exists public.login_attempts (
  email_hash text primary key,
  fail_count int not null default 0,
  lock_count int not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_ip text,
  updated_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from public, anon, authenticated;
