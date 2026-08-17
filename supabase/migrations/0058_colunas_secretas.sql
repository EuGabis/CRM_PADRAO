-- ============================================================
-- 0058 — grant de coluna explícito para as tabelas com segredo
--
-- POR QUE OS `revoke select (coluna)` DA 0055/0057 NÃO PROTEGEM NADA
--
-- No Postgres, revoke de privilégio em COLUNA não subtrai de um grant de
-- privilégio de TABELA já concedido. São listados em catálogos diferentes
-- (attacl por coluna vs relacl por tabela); revogar a coluna quando o papel
-- já tem select na tabela inteira não faz nada — o Postgres emite
-- `WARNING: no privileges could be revoked` e segue. A 0055 concede
-- `select ... on all tables in schema public to authenticated` (grant de
-- tabela); os `revoke select (col) ... from authenticated` que vêm depois,
-- na própria 0055 e na 0057, são no-op silencioso.
--
-- Consequência real: qualquer usuário logado lê, direto do navegador via
-- PostgREST, `whatsapp_channels.evolution_token` / `.webhook_secret`
-- (controla a instância de WhatsApp da empresa) e
-- `google_ads_connections.refresh_token` (credencial OAuth de longa duração).
--
-- A ÚNICA forma de restringir coluna quando já existe grant de tabela é
-- inverter a ordem: revogar o SELECT da TABELA inteira e conceder de volta
-- só a lista explícita de colunas não-secretas. É o que este arquivo faz.
-- Repita este padrão — nunca `revoke select (coluna)` sozinho — para
-- qualquer segredo novo.
-- ============================================================

-- ------------------------------------------------------------
-- whatsapp_channels
-- Colunas: 0022 (id, location_id, name, meta_name, phone_e164,
-- phone_number_id, waba_id, sector, daily_limit, active, created_at) +
-- 0057 (provider, evolution_instance, evolution_token[SEGREDO],
-- webhook_secret[SEGREDO], connection_state, disconnected_at).
-- ------------------------------------------------------------
revoke select on public.whatsapp_channels from anon, authenticated;

grant select (
  id, location_id, name, meta_name, phone_e164, phone_number_id, waba_id,
  sector, daily_limit, active, created_at,
  provider, evolution_instance, connection_state, disconnected_at
) on public.whatsapp_channels to authenticated;

-- ------------------------------------------------------------
-- google_ads_connections
-- Colunas: 0023 (id, location_id, customer_id, login_customer_id,
-- refresh_token[SEGREDO], connected_email, currency_code, connected_at,
-- active, created_at, updated_at). Nenhuma migração posterior alterou.
-- ------------------------------------------------------------
revoke select on public.google_ads_connections from anon, authenticated;

grant select (
  id, location_id, customer_id, login_customer_id, connected_email,
  currency_code, connected_at, active, created_at, updated_at
) on public.google_ads_connections to authenticated;
