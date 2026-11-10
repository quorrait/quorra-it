-- Quorra Dispatch: schema + row level security.
-- Every row belongs to one owner (a contractor business). Teams can come later by adding a members table.

create table public.business (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'My Business',
  phone text not null default '',
  email text not null default '',
  tax_rate numeric(5,2) not null default 0,
  qbo_connected boolean not null default false,
  qbo_company text,
  stripe_connected boolean not null default false,
  stripe_account_id text,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  qbo_id text,
  created_at timestamptz not null default now()
);
create index on public.customers (owner_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  title text not null,
  description text not null default '',
  address text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','canceled')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  assigned_to text not null default '',
  created_at timestamptz not null default now()
);
create index on public.jobs (owner_id, start_at);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number int not null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  items jsonb not null default '[]'::jsonb, -- [{description, qty, unit_cents}]
  tax_rate numeric(5,2) not null default 0,
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  qbo_id text,
  created_at timestamptz not null default now(),
  unique (owner_id, number)
);
create index on public.invoices (owner_id, status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method text not null check (method in ('card','cash','check','other')),
  paid_at timestamptz not null default now(),
  stripe_payment_intent text unique,
  qbo_id text,
  created_at timestamptz not null default now()
);
create index on public.payments (owner_id, paid_at);

-- OAuth tokens: only server-side functions (service role) can read these. No select policy on purpose.
create table public.qbo_connections (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

/* ---------------- Row level security ---------------- */

alter table public.business enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.qbo_connections enable row level security;

create policy "own business" on public.business for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own customers" on public.customers for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own jobs" on public.jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own invoices" on public.invoices for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "read own payments" on public.payments for select using (owner_id = auth.uid());
-- no insert/update/delete policy on payments: they are created by record_payment() or the Stripe webhook.

-- Customers/jobs/invoices must reference rows the same owner owns.
create or replace function public.assert_same_owner() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'jobs' and not exists (select 1 from public.customers c where c.id = new.customer_id and c.owner_id = new.owner_id) then
    raise exception 'customer does not belong to this account';
  end if;
  if tg_table_name = 'invoices' then
    if not exists (select 1 from public.customers c where c.id = new.customer_id and c.owner_id = new.owner_id) then
      raise exception 'customer does not belong to this account';
    end if;
    if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.owner_id = new.owner_id) then
      raise exception 'job does not belong to this account';
    end if;
  end if;
  return new;
end $$;
create trigger jobs_same_owner before insert or update on public.jobs for each row execute function public.assert_same_owner();
create trigger invoices_same_owner before insert or update on public.invoices for each row execute function public.assert_same_owner();

-- Clients may edit profile fields only; connection flags are set by server-side functions.
revoke insert, update on public.business from authenticated;
grant insert (name, phone, email, tax_rate) on public.business to authenticated;
grant update (name, phone, email, tax_rate) on public.business to authenticated;

/* ---------------- Money helpers ---------------- */

create or replace function public.invoice_total_cents(inv public.invoices) returns bigint
language sql immutable as $$
  with sub as (
    select coalesce(sum(round((i->>'qty')::numeric * (i->>'unit_cents')::numeric)), 0) as s
    from jsonb_array_elements(inv.items) i
  )
  select (s + round(s * inv.tax_rate / 100))::bigint from sub;
$$;

-- When payments cover the total, flip the invoice to paid.
create or replace function public.mark_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; paid bigint;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = new.invoice_id;
  if inv.status <> 'void' and paid >= public.invoice_total_cents(inv) then
    update public.invoices set status = 'paid' where id = inv.id;
  end if;
  return null;
end $$;
create trigger payments_mark_paid after insert on public.payments for each row execute function public.mark_invoice_paid();

-- Cash / check payments entered in the app.
create or replace function public.record_payment(p_invoice_id uuid, p_amount_cents int, p_method text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare inv public.invoices; paid bigint; out public.payments;
begin
  if p_method not in ('cash','check','other') then raise exception 'card payments are recorded automatically'; end if;
  select * into inv from public.invoices where id = p_invoice_id and owner_id = auth.uid();
  if not found then raise exception 'invoice not found'; end if;
  if inv.status in ('void','draft') then raise exception 'send the invoice before recording a payment'; end if;
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = inv.id;
  if p_amount_cents <= 0 or paid + p_amount_cents > public.invoice_total_cents(inv) then
    raise exception 'amount is more than the balance due';
  end if;
  insert into public.payments (owner_id, invoice_id, amount_cents, method)
  values (auth.uid(), inv.id, p_amount_cents, p_method) returning * into out;
  return out;
end $$;

create or replace function public.disconnect_qbo() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.qbo_connections where owner_id = auth.uid();
  update public.business set qbo_connected = false, qbo_company = null where owner_id = auth.uid();
end $$;

revoke all on function public.record_payment(uuid, int, text) from public, anon;
grant execute on function public.record_payment(uuid, int, text) to authenticated;
revoke all on function public.disconnect_qbo() from public, anon;
grant execute on function public.disconnect_qbo() to authenticated;
-- Quorra Dispatch, part 2: price book, estimates, leads, service plans, team, timesheets, purchase orders.
-- Same rule as part 1: every row belongs to one owner and is protected by row level security.

alter table public.business add column if not exists logo text; -- small data URL for printed documents
grant insert (logo) on public.business to authenticated;
grant update (logo) on public.business to authenticated;

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'Service' check (category in ('Labor','Material','Service','Equipment')),
  unit_cents int not null default 0 check (unit_cents >= 0),
  cost_cents int not null default 0 check (cost_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number int not null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','approved','declined')),
  items jsonb not null default '[]'::jsonb,
  tax_rate numeric(5,2) not null default 0,
  issued_at timestamptz not null default now(),
  valid_until timestamptz not null,
  notes text not null default '',
  job_id uuid references public.jobs (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, number)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  source text not null default '',
  service text not null default '',
  value_cents int not null default 0 check (value_cents >= 0),
  stage text not null default 'new' check (stage in ('new','contacted','quoted','won','lost')),
  notes text not null default '',
  customer_id uuid references public.customers (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.service_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  visit_title text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  interval_months int not null default 12 check (interval_months > 0),
  next_visit date not null,
  status text not null default 'active' check (status in ('active','paused','canceled')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'Technician' check (role in ('Owner','Technician','Office','Sales')),
  phone text not null default '',
  email text not null default '',
  hourly_cents int not null default 0 check (hourly_cents >= 0), -- what an hour of their time costs you
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  color text not null default '#e8590c',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz, -- null while clocked in
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.time_entries (owner_id, start_at);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number int not null,
  vendor text not null,
  job_id uuid references public.jobs (id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ordered','received','canceled')),
  items jsonb not null default '[]'::jsonb, -- unit_cents is your cost
  ordered_at timestamptz not null default now(),
  expected_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, number)
);

create index on public.price_items (owner_id);
create index on public.estimates (owner_id, status);
create index on public.leads (owner_id, stage);
create index on public.service_plans (owner_id, next_visit);
create index on public.team_members (owner_id);
create index on public.purchase_orders (owner_id, status);

-- Any customer/job/invoice/member a row points at must belong to the same account.
create or replace function public.assert_refs_owned() returns trigger language plpgsql as $$
declare
  r jsonb := to_jsonb(new);
  pair text[];
  ok int;
begin
  foreach pair slice 1 in array array[
    array['customer_id', 'customers'],
    array['job_id', 'jobs'],
    array['invoice_id', 'invoices'],
    array['member_id', 'team_members']
  ] loop
    if r ->> pair[1] is not null then
      ok := null;
      execute format('select 1 from public.%I where id = $1 and owner_id = $2', pair[2])
        into ok using (r ->> pair[1])::uuid, new.owner_id;
      if ok is null then
        raise exception '% does not belong to this account', pair[1];
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['price_items','estimates','leads','service_plans','team_members','time_entries','purchase_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.assert_refs_owned()', t || '_refs_owned', t);
  end loop;
end $$;
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('Owner','Manager','Office','Sales','Technician'));
create table public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('estimate','job')),
  name text not null,
  trade text not null default '',
  title text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  hours numeric(4,1) not null default 2,
  created_at timestamptz not null default now()
);
create index on public.doc_templates (owner_id, kind);
alter table public.doc_templates enable row level security;
create policy "own rows" on public.doc_templates for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- New lead pipeline: new > contacted > send_quote > quote_sent > work_order, or declined.
alter table public.leads drop constraint if exists leads_stage_check;
update public.leads set stage = case stage when 'quoted' then 'quote_sent' when 'won' then 'work_order' when 'lost' then 'declined' else stage end;
alter table public.leads add constraint leads_stage_check
  check (stage in ('new','contacted','send_quote','quote_sent','work_order','declined'));
alter table public.leads add column if not exists estimate_id uuid references public.estimates (id) on delete set null;
alter table public.leads add column if not exists job_id uuid references public.jobs (id) on delete set null;

-- Public keys: lead_key identifies a business on its website form, public_token identifies one quote link.
alter table public.business add column if not exists lead_key text unique default replace(gen_random_uuid()::text, '-', '');
update public.business set lead_key = replace(gen_random_uuid()::text, '-', '') where lead_key is null;
alter table public.estimates add column if not exists public_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.estimates set public_token = replace(gen_random_uuid()::text, '-', '') where public_token is null;

-- Leads may only point at this account's own quotes/jobs.
create or replace function public.assert_refs_owned() returns trigger language plpgsql as $$
declare
  r jsonb := to_jsonb(new);
  pair text[];
  ok int;
begin
  foreach pair slice 1 in array array[
    array['customer_id', 'customers'],
    array['job_id', 'jobs'],
    array['invoice_id', 'invoices'],
    array['member_id', 'team_members'],
    array['estimate_id', 'estimates']
  ] loop
    if r ->> pair[1] is not null then
      ok := null;
      execute format('select 1 from public.%I where id = $1 and owner_id = $2', pair[2])
        into ok using (r ->> pair[1])::uuid, new.owner_id;
      if ok is null then
        raise exception '% does not belong to this account', pair[1];
      end if;
    end if;
  end loop;
  return new;
end $$;
-- Private calendar feed links (one for the whole business, one per team member).
alter table public.business add column if not exists calendar_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.business set calendar_token = replace(gen_random_uuid()::text, '-', '') where calendar_token is null;
alter table public.team_members add column if not exists calendar_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.team_members set calendar_token = replace(gen_random_uuid()::text, '-', '') where calendar_token is null;

-- Replace a leaked or shared link. Pass a team member id, or null for the business-wide link.
create or replace function public.reset_calendar_token(p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if p_member is null then
    update public.business set calendar_token = t where owner_id = auth.uid();
  else
    update public.team_members set calendar_token = t where id = p_member and owner_id = auth.uid();
  end if;
  if not found then raise exception 'not found'; end if;
  return t;
end $$;
revoke all on function public.reset_calendar_token(uuid) from public, anon;
grant execute on function public.reset_calendar_token(uuid) to authenticated;
-- Local price guide: the state the business works in (used to adjust national price ranges).
alter table public.business add column if not exists state text;
grant insert (state) on public.business to authenticated;
grant update (state) on public.business to authenticated;
-- Invoice notes/terms and the business mailing address shown on invoices.
alter table public.invoices add column if not exists notes text not null default '';
alter table public.business add column if not exists address text not null default '';
grant insert (address) on public.business to authenticated;
grant update (address) on public.business to authenticated;
-- Time on the job: when work started and how long it actually took (quoted time is the scheduled duration).
alter table public.jobs add column if not exists started_at timestamptz;
alter table public.jobs add column if not exists actual_minutes int check (actual_minutes is null or actual_minutes >= 0);
-- Teams (invite staff into the same business), subscription status, invoice layout and website form settings.

/* ---------- Accounts and members ---------- */
create table public.account_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_member_id uuid references public.team_members (id) on delete cascade, -- removing the team member removes their access
  created_at timestamptz not null default now()
);
create index on public.account_members (owner_id);
alter table public.account_members enable row level security;

-- The business a signed-in person works in: their own, or the one they were invited to.
create or replace function public.account_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select owner_id from public.account_members where user_id = auth.uid()), auth.uid())
$$;
revoke all on function public.account_id() from public, anon;
grant execute on function public.account_id() to authenticated;

create policy "see membership" on public.account_members for select using (user_id = auth.uid() or owner_id = public.account_id());
-- no insert/update/delete policy: memberships are created by accept_invite() and removed with the team member.

/* ---------- Subscription status ---------- */
create table public.platform_settings (
  id boolean primary key default true check (id), -- single row
  require_subscription boolean not null default false -- flip to true at launch
);
insert into public.platform_settings default values;
alter table public.platform_settings enable row level security;
create policy "read settings" on public.platform_settings for select using (true);

create table public.subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'none' check (status in ('none','active','past_due','canceled','incomplete')),
  plan text not null default 'Quorra Dispatch',
  amount_cents int not null default 30000,
  billing_interval text not null default 'month',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  comped boolean not null default false, -- free accounts (yours, demos)
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "read own subscription" on public.subscriptions for select using (owner_id = public.account_id());
-- no client writes: the Stripe webhook (service role) maintains this table.

create or replace function public.billing_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not (select require_subscription from public.platform_settings)
      or exists (select 1 from public.subscriptions s where s.owner_id = public.account_id() and (s.comped or s.status in ('active','past_due')))
$$;
revoke all on function public.billing_ok() from public, anon;
grant execute on function public.billing_ok() to authenticated;

/* ---------- Point every table at the shared account, and require an active plan ---------- */
do $$
declare t text;
begin
  foreach t in array array['customers','jobs','invoices','price_items','estimates','leads','service_plans','team_members','time_entries','purchase_orders','doc_templates','payments','business'] loop
    execute format('alter table public.%I alter column owner_id set default public.account_id()', t);
  end loop;
  foreach t in array array['customers','jobs','invoices','price_items','estimates','leads','service_plans','team_members','time_entries','purchase_orders','doc_templates'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('drop policy if exists %I on public.%I', 'own ' || t, t);
    execute format('create policy "account rows" on public.%I for all using (owner_id = public.account_id() and public.billing_ok()) with check (owner_id = public.account_id() and public.billing_ok())', t);
  end loop;
end $$;
drop policy if exists "read own payments" on public.payments;
create policy "read account payments" on public.payments for select using (owner_id = public.account_id() and public.billing_ok());
drop policy if exists "own business" on public.business;
-- The business row stays readable without a plan so the app can show the billing screen.
create policy "account business" on public.business for all using (owner_id = public.account_id()) with check (owner_id = public.account_id());

/* ---------- Invites ---------- */
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.account_id() references auth.users (id) on delete cascade,
  team_member_id uuid references public.team_members (id) on delete cascade,
  email text not null,
  role text not null default 'Technician',
  code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.invites enable row level security;
create policy "account invites" on public.invites for all using (owner_id = public.account_id()) with check (owner_id = public.account_id());

-- What the invite page shows before the person signs in.
create or replace function public.invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', b.name, 'email', i.email, 'role', i.role)
  from public.invites i join public.business b on b.owner_id = i.owner_id
  where i.code = p_code and i.status = 'pending'
$$;
revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Join the business that invited you. The signed-in email must match the invited email.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; me_email text;
begin
  select lower(email) into me_email from auth.users where id = auth.uid();
  select * into inv from public.invites where code = p_code and status = 'pending';
  if not found then raise exception 'This invite is no longer valid'; end if;
  if lower(inv.email) <> me_email then raise exception 'Sign in with %, the email this invite was sent to', inv.email; end if;
  if exists (select 1 from public.account_members where user_id = auth.uid()) then raise exception 'You already belong to a business'; end if;
  -- drop the empty starter business that sign-up created for this person
  if not exists (select 1 from public.customers where owner_id = auth.uid()) and not exists (select 1 from public.jobs where owner_id = auth.uid()) then
    delete from public.business where owner_id = auth.uid();
  end if;
  insert into public.account_members (user_id, owner_id, team_member_id) values (auth.uid(), inv.owner_id, inv.team_member_id);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.owner_id;
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

/* ---------- Functions that used the signed-in user as the owner ---------- */
create or replace function public.record_payment(p_invoice_id uuid, p_amount_cents int, p_method text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare inv public.invoices; paid bigint; out public.payments;
begin
  if not public.billing_ok() then raise exception 'subscription required'; end if;
  if p_method not in ('cash','check','other') then raise exception 'card payments are recorded automatically'; end if;
  select * into inv from public.invoices where id = p_invoice_id and owner_id = public.account_id();
  if not found then raise exception 'invoice not found'; end if;
  if inv.status in ('void','draft') then raise exception 'send the invoice before recording a payment'; end if;
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = inv.id;
  if p_amount_cents <= 0 or paid + p_amount_cents > public.invoice_total_cents(inv) then
    raise exception 'amount is more than the balance due';
  end if;
  insert into public.payments (owner_id, invoice_id, amount_cents, method)
  values (inv.owner_id, inv.id, p_amount_cents, p_method) returning * into out;
  return out;
end $$;

create or replace function public.disconnect_qbo() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.qbo_connections where owner_id = public.account_id();
  update public.business set qbo_connected = false, qbo_company = null where owner_id = public.account_id();
end $$;

create or replace function public.reset_calendar_token(p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if p_member is null then
    update public.business set calendar_token = t where owner_id = public.account_id();
  else
    update public.team_members set calendar_token = t where id = p_member and owner_id = public.account_id();
  end if;
  if not found then raise exception 'not found'; end if;
  return t;
end $$;

/* ---------- Invoice layout and website form settings ---------- */
alter table public.business add column if not exists doc_settings jsonb not null default '{}'::jsonb;
alter table public.business add column if not exists lead_form jsonb not null default '{}'::jsonb;
grant insert (doc_settings, lead_form) on public.business to authenticated;
grant update (doc_settings, lead_form) on public.business to authenticated;

-- Public: the website form reads its wording and fields from here (lead_key is the credential).
create or replace function public.lead_form_config(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'form', lead_form) from public.business where lead_key = p_key
$$;
revoke all on function public.lead_form_config(text) from public;
grant execute on function public.lead_form_config(text) to anon, authenticated;

-- Take away someone's access (their team member record stays unless you delete it).
create or replace function public.revoke_access(p_team_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.account_members where team_member_id = p_team_member and owner_id = public.account_id();
  update public.invites set status = 'revoked' where team_member_id = p_team_member and owner_id = public.account_id() and status in ('pending','accepted');
end $$;
revoke all on function public.revoke_access(uuid) from public, anon;
grant execute on function public.revoke_access(uuid) to authenticated;
-- Customer portal link per customer, and a review link per business.
alter table public.customers add column if not exists portal_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.customers set portal_token = replace(gen_random_uuid()::text, '-', '') where portal_token is null;
alter table public.business add column if not exists review_url text not null default '';
grant update (review_url) on public.business to authenticated;
-- Technician "on my way" and "arrived" check-ins with optional location.
alter table public.jobs add column if not exists en_route_at timestamptz;
alter table public.jobs add column if not exists en_route_lat double precision;
alter table public.jobs add column if not exists en_route_lng double precision;
alter table public.jobs add column if not exists arrived_at timestamptz;
alter table public.jobs add column if not exists arrived_lat double precision;
alter table public.jobs add column if not exists arrived_lng double precision;

-- Free trial flag on subscriptions.
alter table public.subscriptions add column if not exists trialing boolean not null default false;
alter table public.business add column if not exists yelp_url text not null default '';
grant update (yelp_url) on public.business to authenticated;
notify pgrst, 'reload schema';
alter table public.time_entries add column if not exists overtime_minutes integer not null default 0;
alter table public.time_entries add column if not exists edits jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
-- Preset vendors, pay period, and open hours (used by customer scheduling).
alter table public.business add column if not exists vendors jsonb not null default '[]'::jsonb;
alter table public.business add column if not exists pay_period jsonb not null default '{}'::jsonb;
alter table public.business add column if not exists hours jsonb not null default '{}'::jsonb;
grant update (vendors, pay_period, hours) on public.business to authenticated;
notify pgrst, 'reload schema';
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

/* 0018 */
-- Paid in full: the invoice is paid, the job moves to completed and the lead leaves the work orders list.
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check
  check (stage in ('new','contacted','send_quote','quote_sent','work_order','declined','completed'));

create or replace function public.mark_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; paid bigint;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = new.invoice_id;
  if inv.status <> 'void' and paid >= public.invoice_total_cents(inv) then
    update public.invoices set status = 'paid' where id = inv.id;
    if inv.job_id is not null then
      update public.jobs set status = 'completed' where id = inv.job_id and status <> 'canceled';
      update public.leads set stage = 'completed' where job_id = inv.job_id and stage = 'work_order';
    end if;
  end if;
  return null;
end $$;
notify pgrst, 'reload schema';
-- Reminder bookkeeping so nobody is texted twice.
alter table public.jobs add column if not exists reminder_sent_at timestamptz;
alter table public.service_plans add column if not exists reminder_sent_at timestamptz;
notify pgrst, 'reload schema';
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
-- How long before a visit the customer and the team are reminded (0 = off), plus per-recipient "already sent" marks.
alter table public.business add column if not exists reminders jsonb not null default '{}'::jsonb;
grant update (reminders) on public.business to authenticated;
alter table public.jobs add column if not exists customer_reminded_at timestamptz;
alter table public.jobs add column if not exists team_reminded_at timestamptz;
notify pgrst, 'reload schema';
-- Flag a customer (caution or do not serve) with a note about what happened.
alter table public.customers add column if not exists flag text not null default '';
alter table public.customers add column if not exists flag_note text not null default '';
notify pgrst, 'reload schema';

-- How long the job takes, set on the estimate so online booking blocks the right amount of time. 0 = use the business default.
alter table public.estimates add column if not exists duration_min int not null default 0;
notify pgrst, 'reload schema';

-- Let the account clear its notifications; track quotes accepted but not yet scheduled so the customer can be nudged.
grant delete on public.notifications to authenticated;
drop policy if exists "account notifications delete" on public.notifications;
create policy "account notifications delete" on public.notifications for delete using (owner_id = public.account_id());
alter table public.estimates add column if not exists accepted_at timestamptz;
alter table public.estimates add column if not exists schedule_nudges int not null default 0;
alter table public.estimates add column if not exists quote_link text;
notify pgrst, 'reload schema';
-- An email that already runs its own business can no longer be pulled into someone else's team by an invite
-- (that is what turned an owner into a technician). Use a different email address for team members.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; me_email text;
begin
  select lower(email) into me_email from auth.users where id = auth.uid();
  select * into inv from public.invites where code = p_code and status = 'pending';
  if not found then raise exception 'This invite is no longer valid'; end if;
  if lower(inv.email) <> me_email then raise exception 'Sign in with %, the email this invite was sent to', inv.email; end if;
  if exists (select 1 from public.account_members where user_id = auth.uid()) then raise exception 'You already belong to a business'; end if;
  if exists (select 1 from public.customers where owner_id = auth.uid())
     or exists (select 1 from public.jobs where owner_id = auth.uid())
     or exists (select 1 from public.invoices where owner_id = auth.uid())
     or exists (select 1 from public.subscriptions where owner_id = auth.uid() and status <> 'none') then
    raise exception 'This email already runs its own business on Quorra Dispatch. Invite a different email address for this team member.';
  end if;
  delete from public.business where owner_id = auth.uid(); -- the empty starter business that sign-up created
  insert into public.account_members (user_id, owner_id, team_member_id) values (auth.uid(), inv.owner_id, inv.team_member_id);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.owner_id;
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- (0027) Also refuses an invite sent to the owner's own email.
-- An email that already runs its own business can no longer be pulled into someone else's team by an invite
-- (that is what turned an owner into a technician). Use a different email address for team members.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; me_email text;
begin
  select lower(email) into me_email from auth.users where id = auth.uid();
  select * into inv from public.invites where code = p_code and status = 'pending';
  if not found then raise exception 'This invite is no longer valid'; end if;
  if lower(inv.email) <> me_email then raise exception 'Sign in with %, the email this invite was sent to', inv.email; end if;
  if inv.owner_id = auth.uid() then raise exception 'This invite was sent to the owner''s own email. Invite a different email address for team members.'; end if;
  if exists (select 1 from public.account_members where user_id = auth.uid()) then raise exception 'You already belong to a business'; end if;
  if exists (select 1 from public.customers where owner_id = auth.uid())
     or exists (select 1 from public.jobs where owner_id = auth.uid())
     or exists (select 1 from public.invoices where owner_id = auth.uid())
     or exists (select 1 from public.subscriptions where owner_id = auth.uid() and status <> 'none') then
    raise exception 'This email already runs its own business on Quorra Dispatch. Invite a different email address for this team member.';
  end if;
  delete from public.business where owner_id = auth.uid(); -- the empty starter business that sign-up created
  insert into public.account_members (user_id, owner_id, team_member_id) values (auth.uid(), inv.owner_id, inv.team_member_id);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.owner_id;
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
-- A team member's role, read directly so it is right even when the business's plan is inactive and team rows are hidden.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select tm.role from public.account_members am join public.team_members tm on tm.id = am.team_member_id where am.user_id = auth.uid()
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- (0029) Also refuses an invite sent to the owner's own email.
-- An email that already runs its own business can no longer be pulled into someone else's team by an invite
-- (that is what turned an owner into a technician). Use a different email address for team members.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; me_email text;
begin
  select lower(email) into me_email from auth.users where id = auth.uid();
  select * into inv from public.invites where code = p_code and status = 'pending';
  if not found then raise exception 'This invite is no longer valid'; end if;
  if lower(inv.email) <> me_email then raise exception 'Sign in with %, the email this invite was sent to', inv.email; end if;
  if inv.owner_id = auth.uid() then raise exception 'This invite was sent to the owner''s own email. Invite a different email address for team members.'; end if;
  -- Only a login created after the invite was sent can accept it, so an existing account is never absorbed into another team.
  if (select created_at from auth.users where id = auth.uid()) < inv.created_at then raise exception 'This email already has a Quorra Dispatch login. Invite a different email address for this team member.'; end if;
  if exists (select 1 from public.account_members where user_id = auth.uid()) then raise exception 'You already belong to a business'; end if;
  if exists (select 1 from public.customers where owner_id = auth.uid())
     or exists (select 1 from public.jobs where owner_id = auth.uid())
     or exists (select 1 from public.invoices where owner_id = auth.uid())
     or exists (select 1 from public.subscriptions where owner_id = auth.uid() and status <> 'none') then
    raise exception 'This email already runs its own business on Quorra Dispatch. Invite a different email address for this team member.';
  end if;
  delete from public.business where owner_id = auth.uid(); -- the empty starter business that sign-up created
  insert into public.account_members (user_id, owner_id, team_member_id) values (auth.uid(), inv.owner_id, inv.team_member_id);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.owner_id;
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- Owner-controlled screen access per role, and the business texting number shown in Settings.
alter table public.business add column if not exists role_access jsonb;
alter table public.business add column if not exists text_number text not null default '';
grant update (role_access, text_number) on public.business to authenticated;

-- Card-first signup, editable email templates, and per-person screen access.
create or replace function public.email_in_use(p_email text) returns boolean
language sql security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;
revoke all on function public.email_in_use(text) from public, anon, authenticated;
grant execute on function public.email_in_use(text) to service_role;

alter table public.business add column if not exists email_templates jsonb;
grant update (email_templates) on public.business to authenticated;

alter table public.team_members add column if not exists access jsonb;
grant update (access) on public.team_members to authenticated;
-- Invoice numbering start, and a fingerprint so edited invoices can be updated in QuickBooks.
alter table public.business add column if not exists invoice_next integer;
grant update (invoice_next) on public.business to authenticated;
alter table public.invoices add column if not exists qbo_hash text;
-- Where QuickBooks payments are deposited, and when the first import from QuickBooks ran.
alter table public.business add column if not exists qbo_deposit_account text;
alter table public.business add column if not exists qbo_deposit_name text;
alter table public.business add column if not exists qbo_imported_at timestamptz;
grant update (qbo_deposit_account, qbo_deposit_name) on public.business to authenticated;
-- Remove any duplicates a double-run import could have made, then make duplicates impossible.
delete from public.invoices a using public.invoices b
  where a.owner_id = b.owner_id and a.qbo_id is not null and a.qbo_id = b.qbo_id
    and (a.created_at, a.id) > (b.created_at, b.id);
delete from public.payments a using public.payments b
  where a.owner_id = b.owner_id and a.qbo_id is not null and a.qbo_id = b.qbo_id
    and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists invoices_owner_qbo_uniq on public.invoices (owner_id, qbo_id) where qbo_id is not null;
create unique index if not exists payments_owner_qbo_uniq on public.payments (owner_id, qbo_id) where qbo_id is not null;
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

-- Native push device tokens. business_id is the account owner id.
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  unique (token)
);
create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from anon;
grant select, insert, update, delete on public.device_tokens to authenticated;
drop policy if exists "own device tokens" on public.device_tokens;
create policy "own device tokens" on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.register_device_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'Bad platform'; end if;
  if p_token is null or length(p_token) < 10 or length(p_token) > 4096 then raise exception 'Bad token'; end if;
  delete from public.device_tokens where token = p_token and user_id <> uid;
  insert into public.device_tokens (user_id, business_id, token, platform, updated_at)
  values (uid, public.account_id(), p_token, p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, business_id = excluded.business_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;

-- A notification can name one person. Null still means the whole business.
alter table public.notifications add column if not exists user_id uuid references auth.users (id) on delete cascade;
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
drop policy if exists "account notifications" on public.notifications;
create policy "account notifications" on public.notifications for select using (
  owner_id = public.account_id() and (user_id is null or user_id = auth.uid())
);
drop policy if exists "account notifications delete" on public.notifications;
create policy "account notifications delete" on public.notifications for delete using (
  owner_id = public.account_id() and (user_id is null or user_id = auth.uid())
);
