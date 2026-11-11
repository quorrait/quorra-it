-- Trial and card-fingerprint history that survives account deletion.
-- signup-complete and billing-webhook write it. There is no foreign key to auth.users.

create table if not exists public.trial_history (
  id bigint generated always as identity primary key,
  email_hash text,
  card_fingerprint text,
  stripe_customer text,
  used_at timestamptz not null default now()
);
create index if not exists trial_history_email on public.trial_history (email_hash);
create index if not exists trial_history_card on public.trial_history (card_fingerprint);
alter table public.trial_history enable row level security;
revoke all on table public.trial_history from public, anon, authenticated;

-- "1 login", not "1 logins".
create or replace function public.enforce_login_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int; word text;
begin
  if coalesce(new.active, true) is not true then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.active, true) is true then return new; end if;
  lim := public.plan_seat_limit(new.owner_id);
  used := public._login_count(new.owner_id);
  if used >= lim then
    word := case when lim = 1 then 'login' else 'logins' end;
    raise exception 'Your plan allows % %. Deactivate a login on the Team page before adding another.', lim, word;
  end if;
  return new;
end $$;

create or replace function public.enforce_invite_seat() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; pending int; word text;
begin
  if new.status is distinct from 'pending' then return new; end if;
  if exists (
    select 1 from public.account_members m
    where m.owner_id = new.owner_id and m.team_member_id = new.team_member_id and m.active
  ) then
    return new;
  end if;
  lim := public.plan_seat_limit(new.owner_id);
  select count(*)::int into pending from public.invites i
    where i.owner_id = new.owner_id and i.status = 'pending'
      and i.id is distinct from new.id
      and not exists (
        select 1 from public.account_members m
        where m.owner_id = i.owner_id and m.team_member_id = i.team_member_id and m.active
      );
  if public._login_count(new.owner_id) + pending >= lim then
    word := case when lim = 1 then 'login' else 'logins' end;
    raise exception 'Your plan allows % %. Deactivate a login on the Team page before inviting another.', lim, word;
  end if;
  return new;
end $$;
