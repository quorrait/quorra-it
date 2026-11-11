-- Writes to timesheets, purchase orders, and service plans called plan_allows()
-- from row security. Authenticated users cannot execute that function, so every
-- save failed with "permission denied for function plan_allows". plan_allows_me
-- runs as its owner and checks the signed-in business.

create or replace function public.plan_allows_me(p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.plan_allows(public.account_id(), p_feature)
$$;
revoke all on function public.plan_allows_me(text) from public, anon;
grant execute on function public.plan_allows_me(text) to authenticated;

drop policy if exists "insert plan rows" on public.time_entries;
drop policy if exists "update plan rows" on public.time_entries;
drop policy if exists "delete plan rows" on public.time_entries;
create policy "insert plan rows" on public.time_entries for insert
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('timesheets'));
create policy "update plan rows" on public.time_entries for update
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('timesheets'))
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('timesheets'));
create policy "delete plan rows" on public.time_entries for delete
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('timesheets'));

drop policy if exists "insert plan rows" on public.purchase_orders;
drop policy if exists "update plan rows" on public.purchase_orders;
drop policy if exists "delete plan rows" on public.purchase_orders;
create policy "insert plan rows" on public.purchase_orders for insert
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('purchase_orders'));
create policy "update plan rows" on public.purchase_orders for update
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('purchase_orders'))
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('purchase_orders'));
create policy "delete plan rows" on public.purchase_orders for delete
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('purchase_orders'));

drop policy if exists "insert plan rows" on public.service_plans;
drop policy if exists "update plan rows" on public.service_plans;
drop policy if exists "delete plan rows" on public.service_plans;
create policy "insert plan rows" on public.service_plans for insert
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('service_plans'));
create policy "update plan rows" on public.service_plans for update
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('service_plans'))
  with check (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('service_plans'));
create policy "delete plan rows" on public.service_plans for delete
  using (owner_id = public.account_id() and public.billing_ok() and public.plan_allows_me('service_plans'));
