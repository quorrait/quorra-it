-- Paid in full: the invoice is paid, the job moves to completed and the lead leaves the work orders list.
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check
  check (stage in ('new','contacted','send_quote','quote_sent','work_order','declined','completed'));

create or replace function public.mark_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; paid bigint;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = new.invoice_id;
  if inv.status <> 'void' and paid >= public.invoice_total_cents(inv) then
    update public.invoices set status = 'paid' where id = inv.id;
    if inv.job_id is not null then
      update public.jobs set status = 'completed' where id = inv.job_id and status <> 'canceled';
      update public.leads set stage = 'completed' where job_id = inv.job_id and stage = 'work_order';
    end if;
  end if;
  return null;
end $$;
notify pgrst, 'reload schema';
