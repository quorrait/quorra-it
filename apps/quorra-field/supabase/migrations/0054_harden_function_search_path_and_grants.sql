-- Production pinned search_path on three functions that are not security
-- definer, so 0045 does not touch them, and it removed client grants the
-- earlier migrations leave behind. These statements match that end state.
-- Setting the same search_path again, and revoking privileges that are
-- already gone, does not change production.
--
-- cancel_requests (0021) is not in production. cancel-feedback inserts into
-- it and account-lifecycle deletes from it, so this migration does not drop it.

alter function public.assert_refs_owned() set search_path = public;
alter function public.assert_same_owner() set search_path = public;
alter function public.invoice_total_cents(public.invoices) set search_path = public;

revoke execute on function
  public.enforce_invite_seat(),
  public.enforce_login_seat(),
  public.guard_commission(),
  public.guard_plan_columns(),
  public.mark_invoice_paid(),
  public.assert_refs_owned(),
  public.assert_same_owner()
  from public, anon, authenticated;

revoke execute on function public.active_login_count(uuid) from public, anon;

revoke all on table
  public.hub_audit,
  public.platform_admins,
  public.qbo_connections,
  public.support_tickets,
  public.contact_requests
  from anon, authenticated;
