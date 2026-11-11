-- Per-IP counters for public signup and the contact form. Not applied from this repo.
create table if not exists public.request_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_limits_lookup on public.request_limits (bucket, ip, created_at);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
