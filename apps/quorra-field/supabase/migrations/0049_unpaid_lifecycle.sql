-- Unpaid subscriptions only. A canceled plan, even one set to end at the period,
-- is not put into reviewer mode and is never deleted by the daily job.
-- past_due: 7 days of full access (grace), then 30 days of view-and-export (reviewer),
-- then the account is eligible for deletion (closed).

create table if not exists public.account_notices (
  owner_id uuid not null,
  kind text not null,
  sent_on date not null default (now() at time zone 'utc')::date,
  primary key (owner_id, kind, sent_on)
);
alter table public.account_notices enable row level security;
revoke all on table public.account_notices from public, anon, authenticated;

create table if not exists public.account_deletions (
  owner_id uuid primary key,
  email text,
  business_name text,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on table public.account_deletions from public, anon, authenticated;

create or replace function public.billing_phase(p_owner uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare st text; since timestamptz; is_comped boolean; require boolean;
begin
  select require_subscription into require from public.platform_settings;
  if coalesce(require, false) is not true then return 'ok'; end if;
  select s.status, s.past_due_since, s.comped into st, since, is_comped
  from public.subscriptions s where s.owner_id = p_owner;
  if not found then return 'lapsed'; end if;
  if coalesce(is_comped, false) then return 'ok'; end if;
  -- Still paid through the current period, including a cancel scheduled for the end.
  if st = 'active' then return 'ok'; end if;
  if st = 'past_due' then
    if since is null or since > now() - interval '7 days' then return 'grace'; end if;
    if since > now() - interval '37 days' then return 'reviewer'; end if;
    return 'closed';
  end if;
  return 'lapsed';
end $$;
revoke all on function public.billing_phase(uuid) from public, anon, authenticated;
grant execute on function public.billing_phase(uuid) to service_role;

create or replace function public.billing_phase_me() returns text
language sql stable security definer set search_path = public as $$
  select public.billing_phase(public.account_id())
$$;
revoke all on function public.billing_phase_me() from public, anon;
grant execute on function public.billing_phase_me() to authenticated;

-- Writes: full access, or the 7-day grace. Reviewer cannot write.
create or replace function public.billing_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.billing_phase(public.account_id()) in ('ok', 'grace')
$$;

-- Reads stay open through the 30-day reviewer window.
create or replace function public.billing_can_read() returns boolean
language sql stable security definer set search_path = public as $$
  select public.billing_phase(public.account_id()) in ('ok', 'grace', 'reviewer')
$$;
revoke all on function public.billing_can_read() from public, anon;
grant execute on function public.billing_can_read() to authenticated;

-- Keep the named plan visible during reviewer mode so existing screens can be opened.
create or replace function public.plan_id_of(p_owner uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare raw text; st text; since timestamptz; is_comped boolean; is_staff boolean; paying boolean;
begin
  select s.plan, s.status, s.past_due_since, s.comped into raw, st, since, is_comped
  from public.subscriptions s where s.owner_id = p_owner;
  select exists (
    select 1 from auth.users u
    join public.platform_admins a on lower(a.email) = lower(u.email)
    where u.id = p_owner
  ) into is_staff;
  if coalesce(is_comped, false) or coalesce(is_staff, false) then return 'enterprise'; end if;
  paying := st = 'active' or (st = 'past_due' and (since is null or since > now() - interval '37 days'));
  if not paying then return 'basic'; end if;
  raw := lower(btrim(coalesce(raw, '')));
  if raw in ('basic', 'essentials', 'enterprise') then return raw; end if;
  return 'basic';
end $$;

-- Tables that still use one policy for every action.
do $$
declare t text;
begin
  foreach t in array array['jobs', 'price_items', 'leads', 'doc_templates'] loop
    execute format('drop policy if exists "account rows" on public.%I', t);
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('drop policy if exists "insert %s" on public.%I', t, t);
    execute format('drop policy if exists "update %s" on public.%I', t, t);
    execute format('drop policy if exists "delete %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select using (owner_id = public.account_id() and public.billing_can_read())', t, t);
    execute format('create policy "insert %s" on public.%I for insert with check (owner_id = public.account_id() and public.billing_ok())', t, t);
    execute format('create policy "update %s" on public.%I for update using (owner_id = public.account_id() and public.billing_ok()) with check (owner_id = public.account_id() and public.billing_ok())', t, t);
    execute format('create policy "delete %s" on public.%I for delete using (owner_id = public.account_id() and public.billing_ok())', t, t);
  end loop;
end $$;

-- Existing read policies: allow reviewer selects. Writes stay on billing_ok().
drop policy if exists "read invoices" on public.invoices;
create policy "read invoices" on public.invoices for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read customers" on public.customers;
create policy "read customers" on public.customers for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read estimates" on public.estimates;
create policy "read estimates" on public.estimates for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read team" on public.team_members;
create policy "read team" on public.team_members for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read plan rows" on public.time_entries;
create policy "read plan rows" on public.time_entries for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read plan rows" on public.purchase_orders;
create policy "read plan rows" on public.purchase_orders for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read plan rows" on public.service_plans;
create policy "read plan rows" on public.service_plans for select using (owner_id = public.account_id() and public.billing_can_read());
drop policy if exists "read account payments" on public.payments;
create policy "read account payments" on public.payments for select using (owner_id = public.account_id() and public.billing_can_read());

-- Invites are writes. A reviewer cannot send one.
drop policy if exists "insert invites" on public.invites;
create policy "insert invites" on public.invites for insert
  with check (owner_id = public.account_id() and public.billing_ok() and public.is_manager());
