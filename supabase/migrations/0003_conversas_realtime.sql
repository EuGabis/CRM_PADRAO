-- ============================================================
-- CRM ON — Conversas: trechos (snippets) + Realtime
-- ============================================================

-- Trechos (respostas rápidas usadas no composer)
create table public.snippets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index snippets_location_idx on public.snippets (location_id);

alter table public.snippets enable row level security;
revoke all on public.snippets from anon;

create policy "membros leem" on public.snippets
  for select to authenticated
  using (location_id in (select private.user_locations()));
create policy "membros criam" on public.snippets
  for insert to authenticated
  with check (location_id in (select private.user_locations()));
create policy "membros editam" on public.snippets
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));
create policy "membros excluem" on public.snippets
  for delete to authenticated
  using (location_id in (select private.user_locations()));

-- Realtime: transmite INSERTs/UPDATEs dessas tabelas aos clientes conectados.
-- A RLS continua valendo: cada usuário só recebe eventos das linhas que pode ler.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
