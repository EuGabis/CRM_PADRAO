-- ============================================================
-- CRM ON — Rastreio de entrega dos TEMPLATES de WhatsApp
--
-- template_name marca a mensagem como rastreável (só envios de template).
-- delivered_at/read_at/failed_at guardam a linha do tempo carimbada pelo
-- webhook (status já existe desde a 0022); error_detail traz o motivo da
-- falha. Índice parcial para a aba de Logs. Idempotente. Sem novas policies:
-- a messages já tem RLS por membership.
-- ============================================================
set check_function_bodies = off;

alter table public.messages add column if not exists template_name text;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists failed_at timestamptz;
alter table public.messages add column if not exists error_detail text;

create index if not exists messages_template_name_idx
  on public.messages (location_id, created_at desc)
  where template_name is not null;
