-- ============================================================
-- Lito CRM — Conversas: responsável pelo atendimento
--
-- O rail da caixa de entrada tinha "Atribuídas a mim", mas `conversations`
-- não guardava responsável nenhum — o botão só emitia um toast porque não
-- havia o que filtrar. Esta coluna dá lastro ao filtro e ao seletor de
-- responsável no cabeçalho da conversa.
--
-- `on delete set null`: se o membro sair da equipe, a conversa volta para a
-- caixa do grupo em vez de sumir do filtro de todo mundo.
--
-- Idempotente.
-- ============================================================

alter table public.conversations
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null;

-- O filtro "atribuídas a mim" é sempre location + responsável.
create index if not exists conversations_assigned_idx
  on public.conversations (location_id, assigned_to);
