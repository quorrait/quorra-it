-- Paywall for edge functions, repeat-trial tracking, and a 7-day past_due grace.
-- billing_ok() uses the same rule so row security matches the functions.

alter table public.subscriptions add column if not exists past_due_since timestamptz;
alter table public.subscriptions add column if not exists trial_used_at timestamptz;
alter table public.subscriptions add column if not exists card_fingerprint text;
create index if not exists subscriptions_card_fingerprint on public.subscriptions (card_fingerprint);

create or replace function public.billing_ok_for(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not (select require_subscription from public.platform_settings)
      or exists (
        select 1 from public.subscriptions s
        where s.owner_id = p_owner
          and (
            s.comped
            or s.status = 'active'
            or (
              s.status = 'past_due'
              and s.past_due_since is not null
              and s.past_due_since > now() - interval '7 days'
            )
          )
      );
$$;
revoke all on function public.billing_ok_for(uuid) from public, anon, authenticated;
grant execute on function public.billing_ok_for(uuid) to service_role;

create or replace function public.billing_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.billing_ok_for(public.account_id());
$$;
revoke all on function public.billing_ok() from public, anon;
grant execute on function public.billing_ok() to authenticated;

-- A named plan applies only while the subscription is active, or past_due inside the grace window.
-- Complimentary accounts and Quorra staff stay Enterprise. Everyone else is Basic.
create or replace function public.plan_id_of(p_owner uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare raw text; st text; since timestamptz; is_comped boolean; is_staff boolean; paying boolean;
begin
  select s.plan, s.status, s.past_due_since, s.comped into raw, st, since, is_comped
  from public.subscriptions s where s.owner_id = p_owner;
  select exists (
    select 1 from auth.users u
    join public.platform_admins a on lower(a.email) = lower(u.email)
    where u.id = p_owner
  ) into is_staff;
  if coalesce(is_comped, false) or coalesce(is_staff, false) then return 'enterprise'; end if;
  paying := st = 'active' or (st = 'past_due' and since is not null and since > now() - interval '7 days');
  if not paying then return 'basic'; end if;
  raw := lower(btrim(coalesce(raw, '')));
  if raw in ('basic', 'essentials', 'enterprise') then return raw; end if;
  return 'basic';
end $$;

-- Sales tax needs three decimal places (Missouri is 4.225%).
alter table public.business alter column tax_rate type numeric(6,3);
alter table public.invoices alter column tax_rate type numeric(6,3);
alter table public.estimates alter column tax_rate type numeric(6,3);
