-- Private calendar feed links (one for the whole business, one per team member).
alter table public.business add column if not exists calendar_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.business set calendar_token = replace(gen_random_uuid()::text, '-', '') where calendar_token is null;
alter table public.team_members add column if not exists calendar_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.team_members set calendar_token = replace(gen_random_uuid()::text, '-', '') where calendar_token is null;

-- Replace a leaked or shared link. Pass a team member id, or null for the business-wide link.
create or replace function public.reset_calendar_token(p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if p_member is null then
    update public.business set calendar_token = t where owner_id = auth.uid();
  else
    update public.team_members set calendar_token = t where id = p_member and owner_id = auth.uid();
  end if;
  if not found then raise exception 'not found'; end if;
  return t;
end $$;
revoke all on function public.reset_calendar_token(uuid) from public, anon;
grant execute on function public.reset_calendar_token(uuid) to authenticated;
