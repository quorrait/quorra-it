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
