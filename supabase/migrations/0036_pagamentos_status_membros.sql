-- ============================================================
-- CRM ON — Pagamentos: todo membro enxerga a conexão da Guru
--
-- Bug: um usuário não-administrador abria Pagamentos e via a tela de
-- "Conectar Guru", como se a empresa não tivesse integração. Causa: desde a
-- 0008, `payment_credentials` só é legível por admin (`private.is_admin`) —
-- e com razão, porque a tabela guarda o Account Token e o User Token da Guru.
-- Sem a linha, o app concluía `connected = false`.
--
-- A conexão é da EMPRESA, não de quem está logado. Esta view expõe só o
-- ESTADO da integração — sem nenhum token — para qualquer membro:
--
--   * quem é membro sabe que a Guru está conectada e quando sincronizou;
--   * ninguém além do admin lê `api_key`/`webhook_token`, que continuam
--     protegidos pela RLS original (não mexo nela).
--
-- ATENÇÃO — esta view é SECURITY DEFINER de propósito (sem
-- `security_invoker = on`, ao contrário das outras views do projeto): ela
-- precisa justamente contornar a RLS admin-only da tabela base. Por isso o
-- isolamento entre empresas é feito AQUI DENTRO, no `where` com
-- `private.user_locations()`. Se alguém remover esse where, vaza o estado de
-- integração de outras empresas.
--
-- Idempotente.
-- ============================================================

create or replace view public.payment_integration_status as
select
  pc.location_id,
  pc.provider,
  pc.created_at            as connected_at,
  pc.last_synced_at,
  pc.history_backfill_cursor,
  pc.history_backfill_done,
  pc.contacts_sync_done,
  pc.contacts_total_rows
from public.payment_credentials pc
where pc.location_id in (select private.user_locations());

revoke all on public.payment_integration_status from anon;
grant select on public.payment_integration_status to authenticated;
