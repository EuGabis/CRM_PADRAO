-- ============================================================
-- CRM ON — Conversas: finalizar e arquivar
--
-- Dois eixos independentes de propósito, não um status só:
--   finalizada = atendimento resolvido (some da caixa, mas é histórico vivo)
--   arquivada  = tirada de vista (some da caixa, resolvida ou não)
-- Guardar os dois separados permite responder "quantas finalizei este mês?"
-- mesmo depois de arquivar, coisa que um enum único apagaria.
--
-- Cada eixo guarda quem e quando, no mesmo espírito do log das agendadas (0028).
-- Reabrir/desarquivar = voltar a coluna para NULL.
--
-- Idempotente.
-- ============================================================

alter table public.conversations
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

-- A caixa padrão pergunta "o que está aberto?" — índice parcial cobre o caso
-- comum sem carregar o resto.
create index if not exists conversations_abertas_idx
  on public.conversations (location_id, last_message_at desc)
  where closed_at is null and archived_at is null;

-- E as duas listas de consulta.
create index if not exists conversations_finalizadas_idx
  on public.conversations (location_id, closed_at desc)
  where closed_at is not null;

create index if not exists conversations_arquivadas_idx
  on public.conversations (location_id, archived_at desc)
  where archived_at is not null;
