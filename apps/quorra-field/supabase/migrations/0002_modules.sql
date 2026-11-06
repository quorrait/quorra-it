-- Quorra Field, part 2: price book, estimates, leads, service plans, team, timesheets, purchase orders.
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
