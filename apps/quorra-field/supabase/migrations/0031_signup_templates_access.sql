-- Card-first signup, editable email templates, and per-person screen access.
create or replace function public.email_in_use(p_email text) returns boolean
language sql security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;
revoke all on function public.email_in_use(text) from public, anon, authenticated;
grant execute on function public.email_in_use(text) to service_role;

alter table public.business add column if not exists email_templates jsonb;
grant update (email_templates) on public.business to authenticated;

alter table public.team_members add column if not exists access jsonb;
grant update (access) on public.team_members to authenticated;
