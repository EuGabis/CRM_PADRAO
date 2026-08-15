-- ============================================================
-- CRM ON — Conversas: rail funcional (bot/automação + visualizações salvas)
--
-- 1) messages.automated — marca a mensagem que NÃO foi escrita por uma pessoa
--    (motor de automações hoje; agente de IA amanhã). É o que dá lastro ao
--    filtro "Conversas com automação" do rail — antes ele era só um ícone.
-- 2) inbox_views — visualizações salvas de verdade. Antes eram quatro nomes
--    fixos no código (ORGANIZAR, LEADS LUCAS, ...) que só emitiam um toast.
--
-- Padrão multi-tenant de sempre: RLS membership, revoke do anon, UPDATE com
-- USING + WITH CHECK. Idempotente.
-- ============================================================

-- 1) Marcador de mensagem automática ------------------------------------------

alter table public.messages
  add column if not exists automated boolean not null default false;

-- Índice parcial: a lista pergunta "quais conversas têm mensagem automática?",
-- então só as linhas automáticas interessam (hoje, a minoria).
create index if not exists messages_automated_idx
  on public.messages (location_id, conversation_id)
  where automated;

-- 2) Visualizações salvas da caixa de entrada ---------------------------------

create table if not exists public.inbox_views (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  -- { scope, filter, sort, query } — o estado da caixa no momento em que salvou
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inbox_views_location_idx
  on public.inbox_views (location_id, created_at);

alter table public.inbox_views enable row level security;
revoke all on public.inbox_views from anon;

drop policy if exists "membros leem inbox_views" on public.inbox_views;
create policy "membros leem inbox_views" on public.inbox_views
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam inbox_views" on public.inbox_views;
create policy "membros criam inbox_views" on public.inbox_views
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros editam inbox_views" on public.inbox_views;
create policy "membros editam inbox_views" on public.inbox_views
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem inbox_views" on public.inbox_views;
create policy "membros excluem inbox_views" on public.inbox_views
  for delete to authenticated
  using (location_id in (select private.user_locations()));
