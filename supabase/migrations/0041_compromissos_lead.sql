-- ============================================================
-- Lito CRM — Calendários: compromisso vinculado a um lead
--
-- O compromisso já podia apontar para um contato; faltava apontar para a
-- OPORTUNIDADE (o lead no funil) — é o que responde "essa reunião é de qual
-- negociação?" quando o mesmo contato tem mais de uma.
--
-- `on delete set null` (e não cascade): excluir a oportunidade não pode apagar
-- a reunião da agenda de ninguém. O compromisso continua lá, só perde o
-- vínculo — mesmo critério do `contact_id` na 0001.
--
-- Sem policy nova: `appointments` já tem RLS de membership desde a 0001, e a
-- coluna entra na mesma linha.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists opportunity_id uuid
    references public.opportunities (id) on delete set null;

-- Índice para "quais compromissos são deste lead?" — a consulta do detalhe da
-- oportunidade. Parcial: a grande maioria dos compromissos não tem lead.
create index if not exists appointments_opportunity_idx
  on public.appointments (opportunity_id)
  where opportunity_id is not null;
