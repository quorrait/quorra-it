create table public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('estimate','job')),
  name text not null,
  trade text not null default '',
  title text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  hours numeric(4,1) not null default 2,
  created_at timestamptz not null default now()
);
create index on public.doc_templates (owner_id, kind);
alter table public.doc_templates enable row level security;
create policy "own rows" on public.doc_templates for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
