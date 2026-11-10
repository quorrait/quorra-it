-- Optional recipient. Null means the whole business (existing rows). A user id means only that person.
alter table public.notifications add column if not exists user_id uuid references auth.users (id) on delete cascade;
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

drop policy if exists "account notifications" on public.notifications;
create policy "account notifications" on public.notifications for select using (
  owner_id = public.account_id() and (user_id is null or user_id = auth.uid())
);

drop policy if exists "account notifications delete" on public.notifications;
create policy "account notifications delete" on public.notifications for delete using (
  owner_id = public.account_id() and (user_id is null or user_id = auth.uid())
);

notify pgrst, 'reload schema';
