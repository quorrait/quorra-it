-- Manual check for migration 0041. Run in the SQL editor. It does not change data.
-- Expect: "role enforcement checks passed"
do $$
declare n int;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'is_manager' and p.prosecdef
  ) then
    raise exception 'is_manager() is missing or is not security definer';
  end if;
  if has_function_privilege('anon', 'public.is_manager()', 'execute') then
    raise exception 'anon can still execute is_manager()';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'team_members_block_self_role'
  ) then
    raise exception 'self-role trigger is missing';
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('team_members', 'invites', 'business')
    and cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) ilike '%is_manager%';
  if n < 9 then
    raise exception 'manager write policies are incomplete (% found)', n;
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('invoices', 'customers', 'estimates')
    and cmd = 'DELETE' and qual ilike '%is_manager%';
  if n < 3 then
    raise exception 'delete policies are not limited to managers';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'business' and cmd = 'SELECT' and qual ilike '%is_manager%'
  ) then
    raise exception 'reading the business should not require is_manager()';
  end if;
  raise notice 'role enforcement checks passed';
end $$;
