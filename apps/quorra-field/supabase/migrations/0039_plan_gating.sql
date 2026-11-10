-- Plan gating. Apply before redeploying the edge functions listed in the pull request.
--
-- Safe default: a subscription whose plan is not exactly basic, essentials, or enterprise
-- (including the old label "Quorra Dispatch", a raw Stripe price id, or a missing row)
-- is Basic: 1 login and core features only. It is never unlimited.
-- Complimentary accounts (subscriptions.comped) and Quorra staff (platform_admins) are Enterprise.
-- A trial keeps the plan stored on the subscription, so the customer gets that plan's features.
-- Downgrades do not delete rows. Gated tables stay readable; writes stop until the plan allows them.
-- Deactivated logins stay in account_members with active = false. They cannot use the app and do not count as seats.

alter table public.account_members add column if not exists active boolean not null default true;

-- The business a signed-in person works in. A deactivated login resolves to null, so every existing
-- policy that compares owner_id to account_id() stops working for them.
create or replace function public.account_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.account_members where user_id = auth.uid() and active = false) then null
    else coalesce((select owner_id from public.account_members where user_id = auth.uid()), auth.uid())
  end
$$;

-- basic | essentials | enterprise for one business.
create or replace function public.plan_id_of(p_owner uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare raw text; is_comped boolean; is_staff boolean;
begin
  select s.plan, s.comped into raw, is_comped from public.subscriptions s where s.owner_id = p_owner;
  select exists (
    select 1 from auth.users u
    join public.platform_admins a on lower(a.email) = lower(u.email)
    where u.id = p_owner
  ) into is_staff;
  if coalesce(is_comped, false) or coalesce(is_staff, false) then return 'enterprise'; end if;
  raw := lower(btrim(coalesce(raw, '')));
  if raw in ('basic', 'essentials', 'enterprise') then return raw; end if;
  return 'basic';
end $$;

create or replace function public.plan_id() returns text
language sql stable security definer set search_path = public as $$
  select public.plan_id_of(public.account_id())
$$;

create or replace function public.plan_seat_limit(p_owner uuid) returns int
language sql stable security definer set search_path = public as $$
  select case public.plan_id_of(p_owner) when 'enterprise' then 15 when 'essentials' then 5 else 1 end
$$;

-- Keep the feature names identical to GatedFeature in src/lib/plans.ts.
create or replace function public.plan_allows(p_owner uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.plan_id_of(p_owner)
    when 'enterprise' then p_feature in (
      'booking', 'reminders', 'reschedule_texts', 'timesheets', 'purchase_orders', 'service_plans',
      'qbo', 'custom_layout', 'reports', 'booking_rules')
    when 'essentials' then p_feature in (
      'booking', 'reminders', 'reschedule_texts', 'timesheets', 'purchase_orders', 'service_plans')
    else false
  end
$$;

-- Owner plus logins that are still turned on. Deactivated memberships are kept and not counted.
-- _login_count has no caller check so triggers can use it while an invite is being accepted.
create or replace function public._login_count(p_owner uuid) returns int
language sql stable security definer set search_path = public as $$
  select 1 + (
    select count(*)::int from public.account_members m
    where m.owner_id = p_owner and m.active
  )
$$;

create or replace function public.active_login_count(p_owner uuid) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and p_owner is distinct from public.account_id() then
    raise exception 'Not allowed';
  end if;
  return public._login_count(p_owner);
end $$;

create or replace function public.can_send_invite(p_owner uuid, p_team_member uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare lim int; pending int;
begin
  if exists (
    select 1 from public.account_members m
    where m.owner_id = p_owner and m.team_member_id = p_team_member and m.active
  ) then
    return true;
  end if;
  lim := public.plan_seat_limit(p_owner);
  select count(*)::int into pending from public.invites i
    where i.owner_id = p_owner and i.status = 'pending'
      and not exists (
        select 1 from public.account_members m
        where m.owner_id = i.owner_id and m.team_member_id = i.team_member_id and m.active
      );
  return public._login_count(p_owner) + pending <= lim;
end $$;

revoke all on function public._login_count(uuid) from public, anon, authenticated;
revoke all on function public.plan_id_of(uuid) from public, anon, authenticated;
revoke all on function public.plan_allows(uuid, text) from public, anon, authenticated;
revoke all on function public.plan_seat_limit(uuid) from public, anon, authenticated;
revoke all on function public.can_send_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plan_id_of(uuid) to service_role;
grant execute on function public.plan_allows(uuid, text) to service_role;
grant execute on function public.plan_seat_limit(uuid) to service_role;
grant execute on function public.can_send_invite(uuid, uuid) to service_role;
grant execute on function public.plan_id() to authenticated;
grant execute on function public.active_login_count(uuid) to authenticated, service_role;

-- Turning a login on, or adding one, cannot go past the seat limit.
create or replace function public.enforce_login_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if coalesce(new.active, true) is not true then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.active, true) is true then return new; end if;
  lim := public.plan_seat_limit(new.owner_id);
  used := public._login_count(new.owner_id);
  if used >= lim then
    raise exception 'Your plan allows % logins. Deactivate a login on the Team page before adding another.', lim;
  end if;
  return new;
end $$;

drop trigger if exists account_members_seat on public.account_members;
create trigger account_members_seat before insert or update of active on public.account_members
  for each row execute function public.enforce_login_seat();

-- A pending invite reserves a seat for someone who does not already have an active login.
create or replace function public.enforce_invite_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; pending int;
begin
  if new.status is distinct from 'pending' then return new; end if;
  if exists (
    select 1 from public.account_members m
    where m.owner_id = new.owner_id and m.team_member_id = new.team_member_id and m.active
  ) then
    return new;
  end if;
  lim := public.plan_seat_limit(new.owner_id);
  select count(*)::int into pending from public.invites i
    where i.owner_id = new.owner_id and i.status = 'pending'
      and i.id is distinct from new.id
      and not exists (
        select 1 from public.account_members m
        where m.owner_id = i.owner_id and m.team_member_id = i.team_member_id and m.active
      );
  if public._login_count(new.owner_id) + pending >= lim then
    raise exception 'Your plan allows % logins. Deactivate a login on the Team page before inviting another.', lim;
  end if;
  return new;
end $$;

drop trigger if exists invites_seat on public.invites;
create trigger invites_seat before insert or update of status on public.invites
  for each row execute function public.enforce_invite_seat();

-- Owner (or a team member whose role is Owner) turns a login off or back on. History stays.
create or replace function public.set_login_active(p_member uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare own uuid; mem uuid;
begin
  own := public.account_id();
  if auth.uid() is distinct from own and public.my_role() is distinct from 'Owner' then
    raise exception 'Only the account owner can change logins';
  end if;
  select user_id into mem from public.account_members
    where team_member_id = p_member and owner_id = own;
  if mem is null then raise exception 'That person does not have a login'; end if;
  if mem = own then raise exception 'The owner login cannot be deactivated'; end if;
  update public.account_members set active = p_active where user_id = mem;
end $$;
revoke all on function public.set_login_active(uuid, boolean) from public, anon;
grant execute on function public.set_login_active(uuid, boolean) to authenticated;

-- Reads stay. Writes to gated tables require the plan. Service role (edge functions) bypasses RLS
-- and checks plan_allows itself.
create or replace function public._replace_plan_policy(p_table text, p_feature text) returns void
language plpgsql security definer set search_path = public as $$
begin
  execute format('drop policy if exists "account rows" on public.%I', p_table);
  execute format('drop policy if exists "read plan rows" on public.%I', p_table);
  execute format('drop policy if exists "insert plan rows" on public.%I', p_table);
  execute format('drop policy if exists "update plan rows" on public.%I', p_table);
  execute format('drop policy if exists "delete plan rows" on public.%I', p_table);
  execute format('create policy "read plan rows" on public.%I for select using (owner_id = public.account_id() and public.billing_ok())', p_table);
  execute format('create policy "insert plan rows" on public.%I for insert with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows(public.account_id(), %L))', p_table, p_feature);
  execute format('create policy "update plan rows" on public.%I for update using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows(public.account_id(), %L)) with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows(public.account_id(), %L))', p_table, p_feature, p_feature);
  execute format('create policy "delete plan rows" on public.%I for delete using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows(public.account_id(), %L))', p_table, p_feature);
end $$;

select public._replace_plan_policy('time_entries', 'timesheets');
select public._replace_plan_policy('purchase_orders', 'purchase_orders');
select public._replace_plan_policy('service_plans', 'service_plans');
drop function public._replace_plan_policy(text, text);

-- Settings columns that belong to a higher plan. Unrelated business edits are left alone.
create or replace function public.guard_plan_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hours is distinct from old.hours and not public.plan_allows(new.owner_id, 'booking_rules') then
    raise exception 'Upgrade to Enterprise to change open hours and booking rules';
  end if;
  if new.reminders is distinct from old.reminders and not public.plan_allows(new.owner_id, 'reminders') then
    raise exception 'Upgrade to Essentials to change visit reminders';
  end if;
  if new.pay_period is distinct from old.pay_period and not public.plan_allows(new.owner_id, 'timesheets') then
    raise exception 'Upgrade to Essentials to change the pay period';
  end if;
  if new.vendors is distinct from old.vendors and not public.plan_allows(new.owner_id, 'purchase_orders') then
    raise exception 'Upgrade to Essentials to change vendors';
  end if;
  if (new.doc_settings is distinct from old.doc_settings or new.lead_form is distinct from old.lead_form)
     and not public.plan_allows(new.owner_id, 'custom_layout') then
    raise exception 'Upgrade to Enterprise to change the invoice layout or lead form';
  end if;
  if (new.qbo_connected is distinct from old.qbo_connected or new.qbo_company is distinct from old.qbo_company
      or new.qbo_deposit_account is distinct from old.qbo_deposit_account or new.qbo_deposit_name is distinct from old.qbo_deposit_name)
     and not public.plan_allows(new.owner_id, 'qbo') then
    raise exception 'Upgrade to Enterprise to use QuickBooks';
  end if;
  return new;
end $$;

drop trigger if exists business_plan_columns on public.business;
create trigger business_plan_columns before update on public.business
  for each row execute function public.guard_plan_columns();

create or replace function public.guard_commission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and coalesce(new.commission_pct, 0) <> 0 and not public.plan_allows(new.owner_id, 'reports') then
    new.commission_pct := 0;
  elsif tg_op = 'UPDATE' and new.commission_pct is distinct from old.commission_pct and not public.plan_allows(new.owner_id, 'reports') then
    raise exception 'Upgrade to Enterprise to change commission';
  end if;
  return new;
end $$;

drop trigger if exists team_members_commission on public.team_members;
create trigger team_members_commission before insert or update of commission_pct on public.team_members
  for each row execute function public.guard_commission();
