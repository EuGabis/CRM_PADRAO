-- ============================================================
-- SETUP 02_marketing_pagamentos
-- GERADO por scripts/gerar-setup.ps1 -- nao edite a mao.
-- Fonte: supabase/migrations/, em ordem cronologica real.
-- Rode as partes 01 -> 04 EM ORDEM no SQL Editor. Ver README.md.
-- ============================================================

-- ------------------------------------------------------------
-- 0010_email_marketing.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Email Marketing (schema, RLS e funções)
-- Migração única: rode este arquivo inteiro de uma vez no SQL Editor.
--
-- Padrão de RLS/tenant idêntico à 0001: location_id em tudo, RLS habilitada,
-- revoke de anon, políticas TO authenticated via private.user_locations().
-- Escrita de status/contadores fica com a service role (tick + webhook).
-- ============================================================
set check_function_bodies = off;

-- ---------- Opt-out de marketing (dedicado; não afeta transacionais) ----------
alter table public.contacts
  add column if not exists marketing_opt_out boolean not null default false;

-- ---------- Campanhas ----------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  subject text not null default '',
  -- Sem remetente embutido: quem manda é EMAIL_FROM, do domínio verificado na
  -- conta do Resend de quem instalou. Default fixo aqui faria a campanha nascer
  -- assinando um domínio de terceiro.
  from_email text not null default '',
  reply_to text,
  body_html text not null default '',
  body_text text not null default '',
  audience jsonb not null default '{"type":"all","value":null}',
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at timestamptz,
  total int not null default 0,
  sent int not null default 0,
  delivered int not null default 0,
  opened int not null default 0,
  clicked int not null default 0,
  bounced int not null default 0,
  failed int not null default 0,
  unsubscribed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_location_idx
  on public.email_campaigns (location_id, created_at desc);
create index if not exists email_campaigns_due_idx
  on public.email_campaigns (status, scheduled_at);

-- ---------- Destinatários (fila materializada) ----------
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','delivered','opened','clicked','bounced','failed','skipped')),
  resend_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ecr_campaign_contact_uniq
  on public.email_campaign_recipients (campaign_id, contact_id);
create index if not exists ecr_campaign_status_idx
  on public.email_campaign_recipients (campaign_id, status);
create index if not exists ecr_resend_idx
  on public.email_campaign_recipients (resend_id) where resend_id is not null;

-- ---------- RLS ----------
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
revoke all on public.email_campaigns, public.email_campaign_recipients from anon;

drop policy if exists "membros gerenciam campanhas" on public.email_campaigns;
create policy "membros gerenciam campanhas" on public.email_campaigns
  for all to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros leem destinatarios" on public.email_campaign_recipients;
create policy "membros leem destinatarios" on public.email_campaign_recipients
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ---------- Materialização (todos / tag) ----------
-- Lista inteligente é avaliada em TypeScript (mesmo matchesConditions da tela de
-- Contatos) e inserida via public.add_campaign_recipients — aqui é no-op.
create or replace function private.materialize_recipients(p_campaign_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  camp record;
  aud_type text;
  aud_value text;
  n int;
begin
  select * into camp from public.email_campaigns where id = p_campaign_id;
  if not found then return 0; end if;
  aud_type := camp.audience ->> 'type';
  aud_value := camp.audience ->> 'value';

  if aud_type in ('all','tag') then
    insert into public.email_campaign_recipients (campaign_id, location_id, contact_id, email)
    select p_campaign_id, camp.location_id, c.id, c.email
    from public.contacts c
    where c.location_id = camp.location_id
      and c.email is not null and c.email <> ''
      and coalesce(c.marketing_opt_out, false) = false
      and coalesce(c.dnd, false) = false
      and (aud_type = 'all' or (aud_type = 'tag' and aud_value = any (c.tags)))
    on conflict (campaign_id, contact_id) do nothing;
  end if;

  select count(*) into n from public.email_campaign_recipients where campaign_id = p_campaign_id;
  update public.email_campaigns set total = n, updated_at = now() where id = p_campaign_id;
  return n;
end;
$$;
revoke all on function private.materialize_recipients(uuid) from public, anon, authenticated;

-- ---------- Inserir destinatários pré-filtrados (lista inteligente) ----------
create or replace function public.add_campaign_recipients(p_campaign_id uuid, p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  camp record;
  n int;
begin
  select * into camp from public.email_campaigns where id = p_campaign_id;
  if not found then raise exception 'campanha inexistente'; end if;
  if camp.location_id not in (select private.user_locations()) then
    raise exception 'sem permissão';
  end if;

  insert into public.email_campaign_recipients (campaign_id, location_id, contact_id, email)
  select p_campaign_id, camp.location_id, c.id, c.email
  from public.contacts c
  where c.location_id = camp.location_id
    and c.id = any (p_ids)
    and c.email is not null and c.email <> ''
    and coalesce(c.marketing_opt_out, false) = false
    and coalesce(c.dnd, false) = false
  on conflict (campaign_id, contact_id) do nothing;

  select count(*) into n from public.email_campaign_recipients where campaign_id = p_campaign_id;
  update public.email_campaigns set total = n, updated_at = now() where id = p_campaign_id;
  return n;
end;
$$;
revoke all on function public.add_campaign_recipients(uuid, uuid[]) from anon;
grant execute on function public.add_campaign_recipients(uuid, uuid[]) to authenticated;

-- ---------- Publicar / agendar (checa membership; materializa todos/tag) ----------
create or replace function public.publish_campaign(p_id uuid, p_mode text, p_at timestamptz)
returns public.email_campaigns language plpgsql security definer set search_path = '' as $$
declare
  camp public.email_campaigns;
begin
  select * into camp from public.email_campaigns where id = p_id;
  if not found then raise exception 'campanha inexistente'; end if;
  if camp.location_id not in (select private.user_locations()) then
    raise exception 'sem permissão';
  end if;

  perform private.materialize_recipients(p_id);  -- no-op para smart_list

  update public.email_campaigns
    set status = case when p_mode = 'scheduled' then 'scheduled' else 'sending' end,
        scheduled_at = case when p_mode = 'scheduled' then p_at else null end,
        updated_at = now()
    where id = p_id
    returning * into camp;
  return camp;
end;
$$;
revoke all on function public.publish_campaign(uuid, text, timestamptz) from anon;
grant execute on function public.publish_campaign(uuid, text, timestamptz) to authenticated;

-- ---------- Aplicar evento do Resend (idempotente) ----------
create or replace function private.apply_email_event(
  p_resend_id text, p_type text, p_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  rank_old int; rank_new int;
  ranks jsonb := '{"sent":1,"delivered":2,"opened":3,"clicked":4}';
begin
  select * into r from public.email_campaign_recipients where resend_id = p_resend_id limit 1;
  if not found then return; end if;

  if p_type in ('delivered','opened','clicked') then
    rank_old := coalesce((ranks ->> r.status)::int, 0);
    rank_new := coalesce((ranks ->> p_type)::int, 0);
    if rank_new > rank_old then
      update public.email_campaign_recipients
        set status = p_type,
            delivered_at = case when p_type='delivered' then p_at else delivered_at end,
            opened_at    = case when p_type='opened'    then p_at else opened_at end,
            clicked_at   = case when p_type='clicked'   then p_at else clicked_at end
        where id = r.id;
      update public.email_campaigns
        set delivered = delivered + (case when p_type='delivered' then 1 else 0 end),
            opened    = opened    + (case when p_type='opened'    then 1 else 0 end),
            clicked   = clicked   + (case when p_type='clicked'   then 1 else 0 end),
            updated_at = now()
        where id = r.campaign_id;
    end if;
  elsif p_type in ('bounced','complained') then
    if r.status <> 'bounced' then
      update public.email_campaign_recipients set status = 'bounced' where id = r.id;
      update public.email_campaigns set bounced = bounced + 1, updated_at = now()
        where id = r.campaign_id;
      update public.contacts set marketing_opt_out = true where id = r.contact_id;
    end if;
  end if;
end;
$$;
revoke all on function private.apply_email_event(text, text, timestamptz) from public, anon, authenticated;

-- Wrapper público chamado só pela service role (webhook).
create or replace function public.ingest_email_event(
  p_resend_id text, p_type text, p_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.apply_email_event(p_resend_id, p_type, p_at);
end;
$$;
revoke all on function public.ingest_email_event(text, text, timestamptz) from public, anon, authenticated;

-- ---------- Verificação ----------
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name like 'email_campaign%';
-- select column_name from information_schema.columns
--   where table_name='contacts' and column_name='marketing_opt_out';


-- ------------------------------------------------------------
-- 0008_pagamentos_guru.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Integração de pagamentos: Digital Manager Guru
--
-- Guru avisa vendas/assinaturas via webhook (POST com JSON), autenticado
-- pelo campo `api_token` do corpo — o mesmo valor mostrado no painel da
-- Guru em Configurações > Webhook. Guardamos esse token por empresa em
-- `payment_credentials` e usamos pra reconhecer de qual empresa é cada
-- evento recebido em `/api/webhooks/guru` (rota pública, sem sessão —
-- roda com a service role, como o motor de automações).
-- ============================================================
set check_function_bodies = off;

-- ---------- Credenciais do provedor (uma linha por empresa+provedor) ----------
create table if not exists public.payment_credentials (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  api_key text,
  webhook_token text not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider)
);

-- a rota de webhook busca a empresa pelo token recebido
create unique index if not exists payment_credentials_webhook_token_idx
  on public.payment_credentials (provider, webhook_token);

alter table public.payment_credentials enable row level security;
revoke all on public.payment_credentials from anon;

drop policy if exists "admins leem credenciais" on public.payment_credentials;
create policy "admins leem credenciais" on public.payment_credentials
  for select to authenticated
  using (private.is_admin(location_id));

drop policy if exists "admins criam credenciais" on public.payment_credentials;
create policy "admins criam credenciais" on public.payment_credentials
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins editam credenciais" on public.payment_credentials;
create policy "admins editam credenciais" on public.payment_credentials
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem credenciais" on public.payment_credentials;
create policy "admins excluem credenciais" on public.payment_credentials
  for delete to authenticated
  using (private.is_admin(location_id));

drop trigger if exists payment_credentials_updated_at on public.payment_credentials;
create trigger payment_credentials_updated_at
  before update on public.payment_credentials
  for each row execute function private.set_updated_at();

-- ---------- Eventos recebidos (vendas, assinaturas etc.) ----------
-- `raw` guarda o payload inteiro: o schema público da Guru não está
-- totalmente documentado, então os campos abaixo são melhor-esforço
-- (ver parseGuruPayload em src/lib/data/repos/db/payments.ts) e `raw`
-- é a fonte de verdade caso algum campo mude de nome.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text,
  event_type text,
  status text,
  amount numeric,
  currency text default 'BRL',
  contact_name text,
  contact_email text,
  product_name text,
  raw jsonb not null default '{}',
  received_at timestamptz not null default now()
);

create index if not exists payment_events_location_idx
  on public.payment_events (location_id, received_at desc);
-- evita duplicar o mesmo evento se a Guru reenviar (retry)
create unique index if not exists payment_events_dedup_idx
  on public.payment_events (location_id, provider, external_id)
  where external_id is not null;

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon;

drop policy if exists "membros leem eventos" on public.payment_events;
create policy "membros leem eventos" on public.payment_events
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de webhook (service role, ignora RLS) — sem
-- política de insert/update/delete para authenticated de propósito.

alter publication supabase_realtime add table public.payment_events;


-- ------------------------------------------------------------
-- 0012_pagamentos_guru_assinaturas.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Assinaturas da Guru (estado atual por assinante)
--
-- `payment_events` (migração 0008) já guarda o log bruto de tudo que a
-- Guru envia. Esta tabela guarda o estado ATUAL de cada assinatura —
-- a rota /api/webhooks/guru faz upsert aqui sempre que o evento traz um
-- id de assinatura reconhecível, então a aba Assinaturas mostra quem
-- está ativo/atrasado/cancelado sem precisar reprocessar o log inteiro.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.payment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text not null,
  status text,
  contact_name text,
  contact_email text,
  product_name text,
  amount numeric,
  currency text default 'BRL',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider, external_id)
);

create index if not exists payment_subscriptions_location_idx
  on public.payment_subscriptions (location_id, updated_at desc);

alter table public.payment_subscriptions enable row level security;
revoke all on public.payment_subscriptions from anon;

drop policy if exists "membros leem assinaturas" on public.payment_subscriptions;
create policy "membros leem assinaturas" on public.payment_subscriptions
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de webhook (service role, ignora RLS).

drop trigger if exists payment_subscriptions_updated_at on public.payment_subscriptions;
create trigger payment_subscriptions_updated_at
  before update on public.payment_subscriptions
  for each row execute function private.set_updated_at();

alter publication supabase_realtime add table public.payment_subscriptions;


-- ------------------------------------------------------------
-- 0013_pagamentos_guru_sync.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Sincronização ativa com a Guru (pg_cron a cada minuto)
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



-- ------------------------------------------------------------
-- 0015_payment_files.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Pagamentos: Arquivos e contratos (upload PDF/DOCX)
--
-- A aba "Arquivos e contratos" guarda documentos (contratos, propostas)
-- por empresa. Os binários vão para um bucket privado do Supabase Storage
-- (`payment-files`), com um caminho `{location_id}/{uuid}.{ext}`; os metadados
-- (nome original, tamanho, tipo, quem subiu) ficam em `public.payment_files`.
--
-- Segue o MESMO padrão multi-tenant das outras tabelas: RLS deny-by-default,
-- REVOKE do anon, políticas TO authenticated com checagem de membership via
-- private.user_locations(). As policies de storage.objects espelham isso pelo
-- primeiro segmento do caminho (a pasta = o location_id).
--
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================
set check_function_bodies = off;

-- ---------- Bucket privado ----------
insert into storage.buckets (id, name, public)
values ('payment-files', 'payment-files', false)
on conflict (id) do nothing;

-- ---------- Metadados dos arquivos ----------
create table if not exists public.payment_files (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,               -- nome original do arquivo (ex.: "Contrato.pdf")
  path text not null,               -- caminho no bucket: {location_id}/{uuid}.{ext}
  size bigint,                      -- bytes
  mime text,                        -- application/pdf | ...wordprocessingml.document
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, path)
);

create index if not exists payment_files_location_idx
  on public.payment_files (location_id, created_at desc);

alter table public.payment_files enable row level security;
revoke all on public.payment_files from anon;

drop policy if exists "membros leem arquivos" on public.payment_files;
create policy "membros leem arquivos" on public.payment_files
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam arquivos" on public.payment_files;
create policy "membros criam arquivos" on public.payment_files
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem arquivos" on public.payment_files;
create policy "membros excluem arquivos" on public.payment_files
  for delete to authenticated
  using (location_id in (select private.user_locations()));

drop trigger if exists payment_files_updated_at on public.payment_files;
create trigger payment_files_updated_at
  before update on public.payment_files
  for each row execute function private.set_updated_at();

-- ---------- Políticas do Storage (bucket payment-files) ----------
-- A pasta raiz do objeto é o location_id; membros da empresa leem/gravam/apagam
-- só o que está sob a pasta da própria empresa.
drop policy if exists "membros leem storage de pagamentos" on storage.objects;
create policy "membros leem storage de pagamentos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros gravam storage de pagamentos" on storage.objects;
create policy "membros gravam storage de pagamentos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros apagam storage de pagamentos" on storage.objects;
create policy "membros apagam storage de pagamentos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );


-- ------------------------------------------------------------
-- 0016_payment_contacts_view.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Pagamentos: agregação de contatos (histórico completo)
--
-- A aba Contatos precisa mostrar TODOS os compradores, não só os que
-- couberam nas últimas 100 vendas carregadas no client. Em vez de puxar
-- tudo pro navegador, agregamos no banco por contato (chave = e-mail, ou
-- nome quando não há e-mail) e a UI pagina como o painel da Guru.
--
-- Duas views SECURITY INVOKER (a RLS das tabelas base — payment_events e
-- payment_subscriptions, ambas com policy de leitura por membership —
-- continua valendo, sem vazar dados de outra empresa):
--   * payment_contacts          — uma linha por contato
--   * payment_contacts_summary  — totais por empresa (pros KPIs)
--
-- O conjunto de status "aprovado" espelha classifyGuruStatus() em
-- src/lib/data/guru.ts (categoria "aprovado"). Se aquele vocabulário mudar,
-- atualizar os arrays abaixo junto.
--
-- Idempotente (create or replace).
-- ============================================================

-- statuses de VENDA que contam como aprovada (categoria "aprovado" no TS)
--   approved, completed, trial, started, transferred
-- statuses de ASSINATURA ativa (categoria "aprovado" no TS)
--   active, started, trial

create or replace view public.payment_contacts
with (security_invoker = on) as
with base as (
  select
    location_id,
    coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))) as contact_key,
    contact_name,
    contact_email,
    case
      when lower(status) = any (array['approved','completed','trial','started','transferred'])
      then amount
    end as approved_amount,
    case
      when lower(status) = any (array['approved','completed','trial','started','transferred'])
      then 1 else 0
    end as approved_sale,
    0 as active_sub,
    guru_created_at as activity_at
  from public.payment_events
  union all
  select
    location_id,
    coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))) as contact_key,
    contact_name,
    contact_email,
    null::numeric,
    0,
    case
      when lower(status) = any (array['active','started','trial'])
      then 1 else 0
    end,
    guru_updated_at
  from public.payment_subscriptions
)
select
  location_id,
  contact_key,
  (array_agg(contact_name  order by contact_name)  filter (where contact_name  is not null))[1] as name,
  (array_agg(contact_email order by contact_email) filter (where contact_email is not null))[1] as email,
  coalesce(sum(approved_sale), 0)::int      as purchases,
  coalesce(sum(approved_amount), 0)::numeric as total_spent,
  coalesce(sum(active_sub), 0)::int          as active_subs,
  max(activity_at)                           as last_activity
from base
where contact_key is not null and contact_key <> ''
group by location_id, contact_key;

grant select on public.payment_contacts to authenticated;
revoke all on public.payment_contacts from anon;

create or replace view public.payment_contacts_summary
with (security_invoker = on) as
select
  location_id,
  count(*)::int                                  as contacts,
  coalesce(sum(total_spent), 0)::numeric         as revenue,
  count(*) filter (where active_subs > 0)::int   as with_subs
from public.payment_contacts
group by location_id;

grant select on public.payment_contacts_summary to authenticated;
revoke all on public.payment_contacts_summary from anon;


-- ------------------------------------------------------------
-- 0014_marketing_extras.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Marketing: Brand Boards e Contadores regressivos
-- Migração única: rode este arquivo inteiro de uma vez no SQL Editor.
-- (Trechos já usam a tabela public.snippets da migração 0003.)
-- ============================================================
set check_function_bodies = off;

-- ---------- Brand Boards ----------
create table if not exists public.brand_boards (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  palette text[] not null default '{}',      -- cores em hex (#RRGGBB)
  font text not null default 'Inter',
  created_at timestamptz not null default now()
);
create index if not exists brand_boards_location_idx
  on public.brand_boards (location_id, created_at desc);

-- ---------- Contadores regressivos ----------
create table if not exists public.countdowns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists countdowns_location_idx
  on public.countdowns (location_id, created_at desc);

-- ---------- RLS (mesmo padrão de membership das outras tabelas) ----------
alter table public.brand_boards enable row level security;
alter table public.countdowns enable row level security;
revoke all on public.brand_boards, public.countdowns from anon;

drop policy if exists "membros gerenciam brand_boards" on public.brand_boards;
create policy "membros gerenciam brand_boards" on public.brand_boards
  for all to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros gerenciam countdowns" on public.countdowns;
create policy "membros gerenciam countdowns" on public.countdowns
  for all to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

-- ---------- Verificação ----------
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name in ('brand_boards','countdowns');


-- ------------------------------------------------------------
-- 0015_campaign_accent.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Email Marketing: cor de destaque da campanha (Brand Board)
-- Rode este arquivo inteiro de uma vez no SQL Editor.
-- ============================================================
alter table public.email_campaigns
  add column if not exists accent_color text;


-- ------------------------------------------------------------
-- 0016_campaign_claim.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Email Marketing: claim atômico de destinatários
-- Evita envio duplicado quando dois ticks do cron se sobrepõem.
-- Rode este arquivo inteiro de uma vez no SQL Editor.
-- ============================================================
set check_function_bodies = off;

alter table public.email_campaign_recipients
  add column if not exists claimed_at timestamptz;

create index if not exists ecr_claim_idx
  on public.email_campaign_recipients (campaign_id, status, claimed_at);

-- Reivindica atomicamente um lote de destinatários pendentes e o retorna já com os
-- dados do contato. FOR UPDATE SKIP LOCKED garante que dois ticks simultâneos peguem
-- lotes diferentes (nunca o mesmo destinatário duas vezes). Um claim "preso" (tick que
-- caiu antes de marcar 'sent') é reaproveitado após 5 minutos.
create or replace function public.claim_recipients(p_campaign_id uuid, p_limit int)
returns table (
  id uuid,
  contact_id uuid,
  email text,
  first_name text,
  last_name text,
  custom_fields jsonb
) language plpgsql security definer set search_path = '' as $$
begin
  -- só envia se a campanha ainda estiver 'sending' (respeita pausa/cancelamento)
  if not exists (
    select 1 from public.email_campaigns c
    where c.id = p_campaign_id and c.status = 'sending'
  ) then
    return;
  end if;

  return query
  with picked as (
    select r.id
    from public.email_campaign_recipients r
    where r.campaign_id = p_campaign_id
      and r.status = 'pending'
      and (r.claimed_at is null or r.claimed_at < now() - interval '5 minutes')
    order by r.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.email_campaign_recipients r
    set claimed_at = now()
    from picked
    where r.id = picked.id
    returning r.id, r.contact_id, r.email
  )
  select cl.id, cl.contact_id, cl.email, ct.first_name, ct.last_name, ct.custom_fields
  from claimed cl
  join public.contacts ct on ct.id = cl.contact_id;
end;
$$;

revoke all on function public.claim_recipients(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_recipients(uuid, int) to service_role;


-- ------------------------------------------------------------
-- 0017_guru_history_backfill.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Backfill histórico de vendas da Guru (retroativo)
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


-- ------------------------------------------------------------
-- 0018_guru_contacts_sync.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Contatos reais da Guru (GET /api/v2/contacts)
--
-- A aba Contatos até aqui (migração 0016) agregava contatos a partir de
-- payment_events/payment_subscriptions — só cobre quem já apareceu numa
-- venda/assinatura sincronizada, e nunca captura telefone/documento (esses
-- campos não existem nas tabelas base). A Guru tem um endpoint de contatos
-- dedicado (referencia-api/contacts.yaml) com nome/email/doc/telefone e uma
-- contagem própria (total_rows) — é o número que aparece no painel da Guru
-- (ex.: 7423) e não necessariamente é igual ao de compradores únicos.
--
-- payment_guru_contacts: uma linha por contato da Guru, sincronizada em
-- pedaços (contacts_sync_cursor/contacts_sync_done/contacts_total_rows em
-- payment_credentials) pelo mesmo /api/integrations/guru/sync — ver
-- contactsSyncChunk().
-- ============================================================
set check_function_bodies = off;

create table if not exists public.payment_guru_contacts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text,
  email text,
  doc text,
  phone text,
  guru_created_at timestamptz,
  guru_updated_at timestamptz,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider, external_id)
);

create index if not exists payment_guru_contacts_location_idx
  on public.payment_guru_contacts (location_id, name);
create index if not exists payment_guru_contacts_doc_idx
  on public.payment_guru_contacts (location_id, doc);
create index if not exists payment_guru_contacts_phone_idx
  on public.payment_guru_contacts (location_id, phone);

alter table public.payment_guru_contacts enable row level security;
revoke all on public.payment_guru_contacts from anon;

drop policy if exists "membros leem contatos guru" on public.payment_guru_contacts;
create policy "membros leem contatos guru" on public.payment_guru_contacts
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de sync (service role, ignora RLS).

drop trigger if exists payment_guru_contacts_updated_at on public.payment_guru_contacts;
create trigger payment_guru_contacts_updated_at
  before update on public.payment_guru_contacts
  for each row execute function private.set_updated_at();

alter table public.payment_credentials
  add column if not exists contacts_sync_cursor text,
  add column if not exists contacts_sync_done boolean not null default false,
  add column if not exists contacts_total_rows int;


-- ------------------------------------------------------------
-- 0019_payment_contacts_valores.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Contatos: telefone/documento na visão de valores
--
-- migração 0016 criou payment_contacts/payment_contacts_summary (compras,
-- total gasto, assinaturas ativas) agregando payment_events + payment_
-- subscriptions. migração 0018 trouxe o cadastro real da Guru (telefone,
-- CPF) em payment_guru_contacts, mas numa aba separada — perdendo os
-- valores. Aqui as duas se juntam: payment_contacts passa a expor
-- phone/doc também, casando por e-mail com payment_guru_contacts, para a
-- aba Contatos voltar a mostrar compras/total gasto/assinaturas E permitir
-- busca por telefone/CPF na mesma tabela.
--
-- Índices por lower(contact_email)/lower(email) — o join e o filtro de
-- busca (.or() ilike) rodam a cada tecla digitada; sem eles a agregação
-- fica lenta conforme o histórico cresce.
--
-- Idempotente (create or replace / create index if not exists).
-- ============================================================

create index if not exists payment_events_location_email_idx
  on public.payment_events (location_id, lower(contact_email));
create index if not exists payment_subscriptions_location_email_idx
  on public.payment_subscriptions (location_id, lower(contact_email));
create index if not exists payment_guru_contacts_email_idx
  on public.payment_guru_contacts (location_id, lower(email));

create or replace view public.payment_contacts
with (security_invoker = on) as
with base as (
  select
    e.location_id,
    coalesce(nullif(lower(trim(e.contact_email)), ''), lower(trim(e.contact_name))) as contact_key,
    e.contact_name,
    e.contact_email,
    g.phone,
    g.doc,
    case
      when lower(e.status) = any (array['approved','completed','trial','started','transferred'])
      then e.amount
    end as approved_amount,
    case
      when lower(e.status) = any (array['approved','completed','trial','started','transferred'])
      then 1 else 0
    end as approved_sale,
    0 as active_sub,
    e.guru_created_at as activity_at
  from public.payment_events e
  left join public.payment_guru_contacts g
    on g.location_id = e.location_id
   and e.contact_email is not null and e.contact_email <> ''
   and lower(trim(g.email)) = lower(trim(e.contact_email))
  union all
  select
    s.location_id,
    coalesce(nullif(lower(trim(s.contact_email)), ''), lower(trim(s.contact_name))) as contact_key,
    s.contact_name,
    s.contact_email,
    g.phone,
    g.doc,
    null::numeric,
    0,
    case
      when lower(s.status) = any (array['active','started','trial'])
      then 1 else 0
    end,
    s.guru_updated_at
  from public.payment_subscriptions s
  left join public.payment_guru_contacts g
    on g.location_id = s.location_id
   and s.contact_email is not null and s.contact_email <> ''
   and lower(trim(g.email)) = lower(trim(s.contact_email))
)
select
  location_id,
  contact_key,
  (array_agg(contact_name  order by contact_name)  filter (where contact_name  is not null))[1] as name,
  (array_agg(contact_email order by contact_email) filter (where contact_email is not null))[1] as email,
  coalesce(sum(approved_sale), 0)::int      as purchases,
  coalesce(sum(approved_amount), 0)::numeric as total_spent,
  coalesce(sum(active_sub), 0)::int          as active_subs,
  max(activity_at)                           as last_activity,
  (array_agg(phone order by phone) filter (where phone is not null))[1] as phone,
  (array_agg(doc   order by doc)   filter (where doc   is not null))[1] as doc
from base
where contact_key is not null and contact_key <> ''
group by location_id, contact_key;

grant select on public.payment_contacts to authenticated;
revoke all on public.payment_contacts from anon;

create or replace view public.payment_contacts_summary
with (security_invoker = on) as
select
  location_id,
  count(*)::int                                  as contacts,
  coalesce(sum(total_spent), 0)::numeric         as revenue,
  count(*) filter (where active_subs > 0)::int   as with_subs
from public.payment_contacts
group by location_id;

grant select on public.payment_contacts_summary to authenticated;
revoke all on public.payment_contacts_summary from anon;


-- ------------------------------------------------------------
-- 0020_payment_sales_reports.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Pagamentos: relatórios com o histórico completo
--
-- Vendas e Relatórios calculavam receita/gráficos a partir do array em
-- memória do store (`usePaymentEvents`), que só carrega as 100 vendas mais
-- recentes (limite pensado pra a tabela da aba Vendas, não pra agregações).
-- Com o histórico completo sincronizado (milhares de vendas desde 2024), os
-- últimos 6 meses sozinhos já passam de 100 vendas — receita, ticket médio
-- e produtos que mais faturam ficavam bem abaixo do que a própria Guru
-- mostra no Resumo Diário.
--
-- payment_sales_monthly agrega no Postgres (mês x produto), então mesmo com
-- milhares de vendas o resultado que volta pro client é só "meses x
-- produtos distintos" — pequeno, rápido de somar em memória, sempre exato.
--
-- Mesmo vocabulário de status "aprovado" das views de contatos (migração
-- 0016) — se classifyGuruStatus() mudar essa categoria, atualizar aqui.
--
-- Idempotente (create or replace / create index if not exists).
-- ============================================================

create index if not exists payment_events_location_created_idx
  on public.payment_events (location_id, guru_created_at);

-- Agrega por status (não só "aprovado") pra cobrir também reembolsos e
-- chargebacks nos KPIs — o client classifica com classifyGuruStatus(),
-- igual já fazia com o array em memória.
create or replace view public.payment_sales_monthly
with (security_invoker = on) as
select
  location_id,
  date_trunc('month', guru_created_at) as month,
  coalesce(nullif(trim(product_name), ''), 'Sem produto') as product_name,
  count(*)::int as sales_count,
  coalesce(sum(amount), 0)::numeric as revenue,
  status
from public.payment_events
where guru_created_at is not null
group by location_id, date_trunc('month', guru_created_at), coalesce(nullif(trim(product_name), ''), 'Sem produto'), status;

grant select on public.payment_sales_monthly to authenticated;
revoke all on public.payment_sales_monthly from anon;


-- ------------------------------------------------------------
-- 0021_payment_contacts_perf.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Contatos: índices para a busca por valor ficar rápida
--
-- payment_contacts (migração 0016/0019) agrega payment_events +
-- payment_subscriptions por contact_key com array_agg/group by. Buscar por
-- nome/e-mail/telefone/documento nessa view filtra DEPOIS da agregação —
-- Postgres precisa computar o group by inteiro (23k+ vendas, 2.4k
-- assinaturas) antes de aplicar o ILIKE. Medido: ~680ms por tecla digitada.
--
-- payment_guru_contacts (migração 0018) já tem índices simples em
-- name/phone/doc e é 90x mais rápido pra busca (~7ms) — vira a fonte
-- principal de listagem/busca. payment_contacts (compras/total gasto/
-- assinaturas/última atividade) passa a ser só um enriquecimento pontual
-- da página visível (≤20 contatos), filtrando por contact_key = ANY(...).
-- Esse filtro é por igualdade numa coluna de agrupamento — o planner
-- consegue empurrar pra dentro do scan das tabelas base, mas sem um índice
-- que bata exatamente com a expressão do contact_key ainda cai em Seq Scan
-- (medido ~106ms pra 5 chaves). Os índices funcionais abaixo resolvem isso.
--
-- Idempotente (create index if not exists).
-- ============================================================

create index if not exists payment_events_contact_key_idx
  on public.payment_events (
    location_id,
    (coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))))
  );

create index if not exists payment_subscriptions_contact_key_idx
  on public.payment_subscriptions (
    location_id,
    (coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))))
  );


