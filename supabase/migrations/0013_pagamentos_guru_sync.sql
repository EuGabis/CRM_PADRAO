-- ============================================================
-- Lito CRM — Sincronização ativa com a Guru (pg_cron a cada minuto)
--
-- Além do webhook (migração 0008), a Guru também expõe uma API REST
-- (digitalmanager.guru/api/v2/transactions|subscriptions, autenticada com
-- o User Token) que devolve o estado atual de vendas e assinaturas — é o
-- que alimenta as telas "Vendas" e "Assinaturas" do próprio painel da Guru.
-- Este job chama /api/integrations/guru/sync todo minuto (pg_net), que por
-- sua vez consulta essa API para cada empresa conectada e faz upsert em
-- payment_events/payment_subscriptions. Mesmo padrão do motor de
-- automações (pg_cron + pg_net chamando uma rota do Next protegida por
-- segredo), só que aqui a rota puxa dados em vez de só processar fila.
-- ============================================================
set check_function_bodies = off;

-- ---------- Estado de sincronização por credencial ----------
-- last_synced_at = cursor (até onde já sincronizamos). sync_started_at é só
-- uma trava: o job tenta "reivindicar" a credencial fazendo update condicional
-- (só some sync_started_at for nulo ou tiver mais de 55s) antes de sincronizar,
-- pra dois ticks do cron não processarem a mesma empresa em paralelo.
alter table public.payment_credentials
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_started_at timestamptz;

-- ---------- payment_events passa a ser upsert (estado atual), não log ----------
-- Antes só media duplicidade de reenvio de webhook (índice parcial). Agora o
-- job de sync também escreve aqui, e uma transação pode ser vista várias
-- vezes com status diferentes (pendente -> aprovada -> reembolsada) — cada
-- chamada faz upsert pela chave (location_id, provider, external_id) para
-- refletir sempre o status mais recente.
drop index if exists public.payment_events_dedup_idx;

update public.payment_events set external_id = id::text where external_id is null;
alter table public.payment_events alter column external_id set not null;

alter table public.payment_events
  add column if not exists code text,
  add column if not exists guru_created_at timestamptz,
  add column if not exists guru_updated_at timestamptz;

alter table public.payment_events
  drop constraint if exists payment_events_location_provider_external_uniq;
alter table public.payment_events
  add constraint payment_events_location_provider_external_uniq
  unique (location_id, provider, external_id);

-- ---------- payment_subscriptions: campos que batem com o painel da Guru ----------
-- Código (sub_...), Iniciada Em, Atualizada Em, Qtd Cobranças, Cobrada a cada —
-- mesmas colunas que aparecem na tela "Assinaturas" do painel da Guru.
alter table public.payment_subscriptions
  add column if not exists code text,
  add column if not exists guru_started_at timestamptz,
  add column if not exists guru_updated_at timestamptz,
  add column if not exists charged_times int,
  add column if not exists charged_every_days int,
  add column if not exists next_cycle_at date;

-- ============================================================
-- Agendamento — roda a cada minuto
-- ============================================================
select cron.unschedule('lito-guru-sync')
where exists (select 1 from cron.job where jobname = 'lito-guru-sync');

select cron.schedule(
  'lito-guru-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lito-crm.vercel.app/api/integrations/guru/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-guru-sync-secret', '066b7b12be23992b80b8208a5c5d365a22c8e56c1b2b9bf5'
    ),
    body := '{}'::jsonb
  );
  $$
);
