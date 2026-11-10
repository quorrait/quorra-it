-- Device tokens for native push. A person can only see and change their own rows.
-- business_id is the account owner id (the same key as notifications.owner_id).
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  unique (token)
);
create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from anon;
grant select, insert, update, delete on public.device_tokens to authenticated;

drop policy if exists "own device tokens" on public.device_tokens;
create policy "own device tokens" on public.device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Reassigns a token that used to belong to another login on the same phone.
create or replace function public.register_device_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'Bad platform'; end if;
  if p_token is null or length(p_token) < 10 or length(p_token) > 4096 then raise exception 'Bad token'; end if;
  delete from public.device_tokens where token = p_token and user_id <> uid;
  insert into public.device_tokens (user_id, business_id, token, platform, updated_at)
  values (uid, public.account_id(), p_token, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        business_id = excluded.business_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;
revoke all on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;

notify pgrst, 'reload schema';
