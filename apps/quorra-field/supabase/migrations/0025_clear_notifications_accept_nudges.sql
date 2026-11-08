-- Let the account clear its notifications; track quotes accepted but not yet scheduled so the customer can be nudged.
grant delete on public.notifications to authenticated;
drop policy if exists "account notifications delete" on public.notifications;
create policy "account notifications delete" on public.notifications for delete using (owner_id = public.account_id());
alter table public.estimates add column if not exists accepted_at timestamptz;
alter table public.estimates add column if not exists schedule_nudges int not null default 0;
alter table public.estimates add column if not exists quote_link text;
notify pgrst, 'reload schema';
