-- ============================================================
-- Lito CRM — Mensagens agendadas: log e disparo de verdade
--
-- Até aqui "Programar" só gravava `messages.scheduled_for` e pintava o selo
-- AGENDADA. Nada disparava a mensagem na hora marcada e não havia registro de
-- quem agendou. Estas colunas são o log:
--   scheduled_by    — quem agendou
--   schedule_status — pendente → enviando → enviada | falhou | cancelada
--   dispatched_at   — quando saiu de verdade
--   schedule_error  — motivo, quando falhou
--
-- Quem dispara é o batimento de minuto que já existe (/api/automations/tick,
-- pg_cron), então não há job, segredo nem env novos.
--
-- Idempotente.
-- ============================================================

alter table public.messages
  add column if not exists scheduled_by uuid references auth.users (id) on delete set null,
  add column if not exists schedule_status text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists schedule_error text;

alter table public.messages drop constraint if exists messages_schedule_status_chk;
alter table public.messages add constraint messages_schedule_status_chk
  check (
    schedule_status is null
    or schedule_status in ('pendente', 'enviando', 'enviada', 'falhou', 'cancelada')
  );

-- Agendamentos que já existiam entram no log como pendentes.
update public.messages
   set schedule_status = 'pendente'
 where scheduled_for is not null
   and schedule_status is null;

-- O disparador pergunta "o que venceu?" — só as pendentes interessam.
create index if not exists messages_scheduled_pending_idx
  on public.messages (scheduled_for)
  where schedule_status = 'pendente';

-- O log lista por empresa, do mais recente para o mais antigo.
create index if not exists messages_scheduled_log_idx
  on public.messages (location_id, scheduled_for desc)
  where schedule_status is not null;
