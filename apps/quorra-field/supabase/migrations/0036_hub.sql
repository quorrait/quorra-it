-- Quorra Dispatch Hub: who may open it, and a log of every "sign in as".
create table if not exists public.platform_admins (email text primary key);
alter table public.platform_admins enable row level security;
create table if not exists public.hub_audit (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target_owner uuid,
  created_at timestamptz not null default now()
);
alter table public.hub_audit enable row level security;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_platform_admin() to authenticated;
-- Add yourself (use the email you sign in to Quorra Dispatch with), then run:
--   insert into public.platform_admins (email) values ('you@example.com') on conflict do nothing;
