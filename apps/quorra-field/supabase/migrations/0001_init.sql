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
