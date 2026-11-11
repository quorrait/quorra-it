-- Matches the search_path hardening applied directly in Supabase. Do not run this again if those functions already pin search_path.
-- Security-definer functions in public that were created without a search_path get one. Existing pins are left alone.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'
      ))
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;
