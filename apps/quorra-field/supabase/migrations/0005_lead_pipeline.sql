-- New lead pipeline: new > contacted > send_quote > quote_sent > work_order, or declined.
alter table public.leads drop constraint if exists leads_stage_check;
update public.leads set stage = case stage when 'quoted' then 'quote_sent' when 'won' then 'work_order' when 'lost' then 'declined' else stage end;
alter table public.leads add constraint leads_stage_check
  check (stage in ('new','contacted','send_quote','quote_sent','work_order','declined'));
alter table public.leads add column if not exists estimate_id uuid references public.estimates (id) on delete set null;
alter table public.leads add column if not exists job_id uuid references public.jobs (id) on delete set null;

-- Public keys: lead_key identifies a business on its website form, public_token identifies one quote link.
alter table public.business add column if not exists lead_key text unique default replace(gen_random_uuid()::text, '-', '');
update public.business set lead_key = replace(gen_random_uuid()::text, '-', '') where lead_key is null;
alter table public.estimates add column if not exists public_token text unique default replace(gen_random_uuid()::text, '-', '');
update public.estimates set public_token = replace(gen_random_uuid()::text, '-', '') where public_token is null;

-- Leads may only point at this account's own quotes/jobs.
create or replace function public.assert_refs_owned() returns trigger language plpgsql as $$
declare
  r jsonb := to_jsonb(new);
  pair text[];
  ok int;
begin
  foreach pair slice 1 in array array[
    array['customer_id', 'customers'],
    array['job_id', 'jobs'],
    array['invoice_id', 'invoices'],
    array['member_id', 'team_members'],
    array['estimate_id', 'estimates']
  ] loop
    if r ->> pair[1] is not null then
      ok := null;
      execute format('select 1 from public.%I where id = $1 and owner_id = $2', pair[2])
        into ok using (r ->> pair[1])::uuid, new.owner_id;
      if ok is null then
        raise exception '% does not belong to this account', pair[1];
      end if;
    end if;
  end loop;
  return new;
end $$;
