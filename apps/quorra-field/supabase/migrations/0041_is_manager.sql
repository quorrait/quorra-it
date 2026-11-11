-- Owners and managers may change team, invites, and business records.
-- Everyone on the account can still read them. Technicians cannot delete customers, invoices, or estimates.
-- Not applied from this repo. Run it in Supabase after a Technician login check.

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = public.account_id()
      or public.my_role() in ('Owner', 'Manager');
$$;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

-- The app does not let a person edit their own team row. This still stops a manager from promoting themselves.
create or replace function public.block_self_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.role is distinct from old.role and exists (
    select 1 from public.account_members am where am.user_id = auth.uid() and am.team_member_id = new.id
  ) then
    raise exception 'You cannot change your own role';
  end if;
  return new;
end $$;
drop trigger if exists team_members_block_self_role on public.team_members;
create trigger team_members_block_self_role
  before update of role on public.team_members
  for each row execute function public.block_self_role_change();

-- team_members: read stays account-wide. Writes are managers only.
drop policy if exists "account rows" on public.team_members;
drop policy if exists "read team" on public.team_members;
drop policy if exists "insert team" on public.team_members;
drop policy if exists "update team" on public.team_members;
drop policy if exists "delete team" on public.team_members;
create policy "read team" on public.team_members for select
  using (owner_id = public.account_id() and public.billing_ok());
create policy "insert team" on public.team_members for insert
  with check (owner_id = public.account_id() and public.billing_ok() and public.is_manager());
create policy "update team" on public.team_members for update
  using (owner_id = public.account_id() and public.billing_ok() and public.is_manager())
  with check (owner_id = public.account_id() and public.billing_ok() and public.is_manager());
create policy "delete team" on public.team_members for delete
  using (owner_id = public.account_id() and public.billing_ok() and public.is_manager());

-- invites
drop policy if exists "account invites" on public.invites;
drop policy if exists "read invites" on public.invites;
drop policy if exists "insert invites" on public.invites;
drop policy if exists "update invites" on public.invites;
drop policy if exists "delete invites" on public.invites;
create policy "read invites" on public.invites for select
  using (owner_id = public.account_id());
create policy "insert invites" on public.invites for insert
  with check (owner_id = public.account_id() and public.is_manager());
create policy "update invites" on public.invites for update
  using (owner_id = public.account_id() and public.is_manager())
  with check (owner_id = public.account_id() and public.is_manager());
create policy "delete invites" on public.invites for delete
  using (owner_id = public.account_id() and public.is_manager());

-- business: every login can still read the company. Only managers can change it.
drop policy if exists "account business" on public.business;
drop policy if exists "read business" on public.business;
drop policy if exists "insert business" on public.business;
drop policy if exists "update business" on public.business;
drop policy if exists "delete business" on public.business;
create policy "read business" on public.business for select
  using (owner_id = public.account_id());
create policy "insert business" on public.business for insert
  with check (owner_id = public.account_id() and public.is_manager());
create policy "update business" on public.business for update
  using (owner_id = public.account_id() and public.is_manager())
  with check (owner_id = public.account_id() and public.is_manager());
create policy "delete business" on public.business for delete
  using (owner_id = public.account_id() and public.is_manager());

-- Deletes of customer records are manager-only. Creating and editing stay as they are.
do $$
declare t text;
begin
  foreach t in array array['invoices', 'customers', 'estimates'] loop
    execute format('drop policy if exists "account rows" on public.%I', t);
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('drop policy if exists "insert %s" on public.%I', t, t);
    execute format('drop policy if exists "update %s" on public.%I', t, t);
    execute format('drop policy if exists "delete %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select using (owner_id = public.account_id() and public.billing_ok())', t, t);
    execute format('create policy "insert %s" on public.%I for insert with check (owner_id = public.account_id() and public.billing_ok())', t, t);
    execute format('create policy "update %s" on public.%I for update using (owner_id = public.account_id() and public.billing_ok()) with check (owner_id = public.account_id() and public.billing_ok())', t, t);
    execute format('create policy "delete %s" on public.%I for delete using (owner_id = public.account_id() and public.billing_ok() and public.is_manager())', t, t);
  end loop;
end $$;
