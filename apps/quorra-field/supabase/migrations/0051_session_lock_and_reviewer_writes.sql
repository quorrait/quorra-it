-- A locked email cannot open a session by calling Auth directly.
-- Password reset and a fresh confirmation link still can, for one hour.
-- The login function remains the only writer of login_attempts. This trigger only reads it.
-- Reviewer mode is view-and-export. Company settings, invites, and a few
-- security-definer functions were still writable after the grace window.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.reject_locked_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  email text;
  hash text;
  until timestamptz;
  recovery timestamptz;
  confirm_sent timestamptz;
begin
  select u.email, u.recovery_sent_at, u.confirmation_sent_at
    into email, recovery, confirm_sent
  from auth.users u
  where u.id = new.user_id;
  if email is null or btrim(email) = '' then return new; end if;

  hash := encode(extensions.digest(convert_to(lower(btrim(email)), 'UTF8'), 'sha256'), 'hex');
  select a.locked_until into until from public.login_attempts a where a.email_hash = hash;
  if until is null or until <= now() then return new; end if;
  if recovery is not null and recovery > now() - interval '1 hour' then return new; end if;
  if confirm_sent is not null and confirm_sent > now() - interval '1 hour' then return new; end if;

  raise exception 'Too many failed attempts. Try again later or reset your password.';
end $$;

revoke all on function public.reject_locked_sign_in() from public, anon, authenticated;

drop trigger if exists reject_locked_sign_in on auth.sessions;
create trigger reject_locked_sign_in
  before insert on auth.sessions
  for each row execute function public.reject_locked_sign_in();

-- Edge functions were still using the old 7-day check, and a missing past_due_since
-- counted as locked there while the app treated it as grace.
create or replace function public.billing_ok_for(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.billing_phase(p_owner) in ('ok', 'grace');
$$;

drop policy if exists "update business" on public.business;
create policy "update business" on public.business for update
  using (owner_id = public.account_id() and public.is_manager() and public.billing_ok())
  with check (owner_id = public.account_id() and public.is_manager() and public.billing_ok());

drop policy if exists "delete business" on public.business;
create policy "delete business" on public.business for delete
  using (owner_id = public.account_id() and public.is_manager() and public.billing_ok());

drop policy if exists "update invites" on public.invites;
create policy "update invites" on public.invites for update
  using (owner_id = public.account_id() and public.is_manager() and public.billing_ok())
  with check (owner_id = public.account_id() and public.is_manager() and public.billing_ok());

drop policy if exists "delete invites" on public.invites;
create policy "delete invites" on public.invites for delete
  using (owner_id = public.account_id() and public.is_manager() and public.billing_ok());

drop policy if exists "account notifications" on public.notifications;
create policy "account notifications" on public.notifications for select using (
  owner_id = public.account_id() and public.billing_can_read() and (user_id is null or user_id = auth.uid())
);

drop policy if exists "account notifications delete" on public.notifications;
create policy "account notifications delete" on public.notifications for delete using (
  owner_id = public.account_id() and public.billing_ok() and (user_id is null or user_id = auth.uid())
);

create or replace function public.reset_calendar_token(p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.billing_ok() then raise exception 'subscription required'; end if;
  if p_member is null then
    update public.business set calendar_token = t where owner_id = public.account_id();
  else
    update public.team_members set calendar_token = t where id = p_member and owner_id = public.account_id();
  end if;
  if not found then raise exception 'not found'; end if;
  return t;
end $$;

create or replace function public.disconnect_qbo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.billing_ok() then raise exception 'subscription required'; end if;
  delete from public.qbo_connections where owner_id = public.account_id();
  update public.business set qbo_connected = false, qbo_company = null where owner_id = public.account_id();
end $$;

create or replace function public.revoke_access(p_team_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.billing_ok() then raise exception 'subscription required'; end if;
  delete from public.account_members where team_member_id = p_team_member and owner_id = public.account_id();
  update public.invites set status = 'revoked' where team_member_id = p_team_member and owner_id = public.account_id() and status in ('pending','accepted');
end $$;

create or replace function public.set_login_active(p_member uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare own uuid; mem uuid;
begin
  if not public.billing_ok() then raise exception 'subscription required'; end if;
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

create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; me_email text;
begin
  select lower(email) into me_email from auth.users where id = auth.uid();
  select * into inv from public.invites where code = p_code and status = 'pending';
  if not found then raise exception 'This invite is no longer valid'; end if;
  if public.billing_phase(inv.owner_id) not in ('ok', 'grace') then
    raise exception 'This company''s plan is not active';
  end if;
  if lower(inv.email) <> me_email then raise exception 'Sign in with %, the email this invite was sent to', inv.email; end if;
  if inv.owner_id = auth.uid() then raise exception 'This invite was sent to the owner''s own email. Invite a different email address for team members.'; end if;
  if (select created_at from auth.users where id = auth.uid()) < inv.created_at then raise exception 'This email already has a Quorra Dispatch login. Invite a different email address for this team member.'; end if;
  if exists (select 1 from public.account_members where user_id = auth.uid()) then raise exception 'You already belong to a business'; end if;
  if exists (select 1 from public.customers where owner_id = auth.uid())
     or exists (select 1 from public.jobs where owner_id = auth.uid())
     or exists (select 1 from public.invoices where owner_id = auth.uid())
     or exists (select 1 from public.subscriptions where owner_id = auth.uid() and status <> 'none') then
    raise exception 'This email already runs its own business on Quorra Dispatch. Invite a different email address for this team member.';
  end if;
  delete from public.business where owner_id = auth.uid();
  insert into public.account_members (user_id, owner_id, team_member_id) values (auth.uid(), inv.owner_id, inv.team_member_id);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.owner_id;
end $$;
