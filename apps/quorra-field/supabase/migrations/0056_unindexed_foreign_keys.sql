-- Covering indexes for foreign keys the performance advisor flags as unindexed.
-- Each column is a single-column foreign key already present in the schema
-- (0001 jobs/invoices/payments, 0002 estimates/leads/service_plans/time_entries/purchase_orders,
-- 0005 leads.estimate_id and leads.job_id, 0010 account_members/invites, 0021 cancel_requests,
-- 0037 device_tokens.business_id). A btree index on the foreign-key column covers that key.
-- Not applied from this change. CREATE INDEX IF NOT EXISTS is safe to re-run.

create index if not exists jobs_customer_id_idx on public.jobs (customer_id);

create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_job_id_idx on public.invoices (job_id);

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);

create index if not exists estimates_customer_id_idx on public.estimates (customer_id);
create index if not exists estimates_job_id_idx on public.estimates (job_id);
create index if not exists estimates_invoice_id_idx on public.estimates (invoice_id);

create index if not exists leads_customer_id_idx on public.leads (customer_id);
create index if not exists leads_estimate_id_idx on public.leads (estimate_id);
create index if not exists leads_job_id_idx on public.leads (job_id);

create index if not exists service_plans_customer_id_idx on public.service_plans (customer_id);
create index if not exists time_entries_member_id_idx on public.time_entries (member_id);
create index if not exists time_entries_job_id_idx on public.time_entries (job_id);
create index if not exists purchase_orders_job_id_idx on public.purchase_orders (job_id);

create index if not exists account_members_team_member_id_idx on public.account_members (team_member_id);
create index if not exists invites_owner_id_idx on public.invites (owner_id);
create index if not exists invites_team_member_id_idx on public.invites (team_member_id);

create index if not exists cancel_requests_owner_id_idx on public.cancel_requests (owner_id);
create index if not exists device_tokens_business_id_idx on public.device_tokens (business_id);
