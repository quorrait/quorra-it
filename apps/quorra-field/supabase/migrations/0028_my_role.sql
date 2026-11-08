-- A team member's role, read directly so it is right even when the business's plan is inactive and team rows are hidden.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select tm.role from public.account_members am join public.team_members tm on tm.id = am.team_member_id where am.user_id = auth.uid()
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;
