-- ============================================================
-- 0057 — Canal de WhatsApp passa a ter provedor
--
-- whatsapp_channels foi moldada na Meta pela 0022: phone_number_id é
-- not null e unique, waba_id idem. Um canal conectado por QR code não tem
-- onde ser gravado.
--
-- A coerência vira `check` e não convenção: canal meta exige
-- phone_number_id, canal evolution exige evolution_instance. Sem isso, em
-- seis meses alguém grava um canal pela metade e o erro aparece longe da
-- causa.
-- ============================================================

alter table public.whatsapp_channels
  alter column phone_number_id drop not null,
  add column if not exists provider          text not null default 'meta',
  add column if not exists evolution_instance text,
  add column if not exists evolution_token    text,
  add column if not exists webhook_secret     text,
  add column if not exists connection_state   text not null default 'disconnected',
  add column if not exists disconnected_at    timestamptz;

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_provider_check;
alter table public.whatsapp_channels
  add constraint whatsapp_channels_provider_check
  check (provider in ('meta', 'evolution'));

create unique index if not exists whatsapp_channels_evolution_instance_key
  on public.whatsapp_channels (evolution_instance)
  where evolution_instance is not null;

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_coerencia_check;
alter table public.whatsapp_channels
  add constraint whatsapp_channels_coerencia_check
  check (
    (provider = 'meta'      and phone_number_id is not null and evolution_instance is null) or
    (provider = 'evolution' and evolution_instance is not null and phone_number_id is null)
  );

-- Canal é de um provedor só. Permitir colunas dos DOIS criaria estado que o
-- código não sabe tratar: webhook da Evolution resolveria por evolution_instance,
-- mas enviaria via API da Meta; índice único faria a instância ocupar nome que
-- deveria estar livre. Exclusão mútua é deliberada.

-- ------------------------------------------------------------
-- evolution_token e webhook_secret são SEGREDOS: com o token dá para enviar
-- mensagem em nome do cliente; com o segredo, injetar mensagem falsa na
-- conversa dele. O cliente vê o estado da conexão, nunca as credenciais.
--
-- Mesmo padrão do refresh_token da 0023. E como a 0055 concede select no
-- nível da tabela, o revoke de coluna precisa vir DEPOIS — grant de tabela
-- reconcede coluna revogada.
-- ------------------------------------------------------------
revoke select (evolution_token, webhook_secret)
  on public.whatsapp_channels from anon, authenticated;
