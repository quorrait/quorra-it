-- Remove any duplicates a double-run import could have made, then make duplicates impossible.
delete from public.invoices a using public.invoices b
  where a.owner_id = b.owner_id and a.qbo_id is not null and a.qbo_id = b.qbo_id
    and (a.created_at, a.id) > (b.created_at, b.id);
delete from public.payments a using public.payments b
  where a.owner_id = b.owner_id and a.qbo_id is not null and a.qbo_id = b.qbo_id
    and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists invoices_owner_qbo_uniq on public.invoices (owner_id, qbo_id) where qbo_id is not null;
create unique index if not exists payments_owner_qbo_uniq on public.payments (owner_id, qbo_id) where qbo_id is not null;
