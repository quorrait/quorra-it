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
