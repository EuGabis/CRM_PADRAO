-- ============================================================
-- Lito CRM — Backfill histórico de vendas da Guru (retroativo)
--
-- O sync incremental (migração 0013) só cobre pra frente a partir de
-- quando a empresa conectou. Esta migração acrescenta o estado pra andar
-- PARA TRÁS também, em pedaços pequenos por tick (a API da Guru limita
-- filtro de data a 180 dias por chamada — ver referencia-api/transactions.yaml
-- — e uma conta com muitas vendas não cabe num intervalo grande dentro dos
-- 60s do Vercel, como já aconteceu com o backfill inicial pra frente).
--
-- history_backfill_cursor: até onde já cobrimos voltando no tempo (anda
-- pra trás a cada tick). Começa nulo; o primeiro tick que rodar depois
-- desta migração inicializa com o início da cobertura incremental atual
-- (sem sobrepor nem deixar buraco).
-- history_backfill_done: true quando o cursor chega em HISTORY_START
-- (01/06/2024, definido em código — src/app/api/integrations/guru/sync).
-- ============================================================
set check_function_bodies = off;

alter table public.payment_credentials
  add column if not exists history_backfill_cursor timestamptz,
  add column if not exists history_backfill_done boolean not null default false;
