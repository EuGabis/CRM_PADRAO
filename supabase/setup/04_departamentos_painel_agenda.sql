-- ============================================================
-- SETUP 04_departamentos_painel_agenda
-- GERADO por scripts/gerar-setup.ps1 -- nao edite a mao.
-- Fonte: supabase/migrations/, em ordem cronologica real.
-- Rode as partes 01 -> 04 EM ORDEM no SQL Editor. Ver README.md.
-- ============================================================

-- ------------------------------------------------------------
-- 0033_departamentos.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Departamentos (segmentaÃ§Ã£o de acesso padrÃ£o)
--
-- AtÃ© aqui a permissÃ£o por mÃ³dulo era individual: cada usuÃ¡rio tinha seu
-- `location_members.permissions`, e montar um perfil novo era repetir a mesma
-- lista de mÃ³dulos na mÃ£o. Departamento passa a ser a base compartilhada.
--
-- Como as permissÃµes efetivas sÃ£o resolvidas (decisÃ£o do Gabriel, 2026-08-14):
--   1. Administrador vÃª tudo â€” departamento nÃ£o se aplica a ele. Isso evita a
--      empresa se trancar fora de ConfiguraÃ§Ãµes.
--   2. ExceÃ§Ã£o individual vence: se `location_members.permissions` tiver a
--      chave do mÃ³dulo, ela manda.
--   3. SenÃ£o, vale o `permissions` do departamento do usuÃ¡rio.
--   4. Sem departamento e sem exceÃ§Ã£o, libera (mantÃ©m o comportamento dos
--      membros antigos, que tÃªm `permissions = {}` e enxergam tudo).
--
-- Por isso `location_members.permissions` deixa de ser "o acesso do usuÃ¡rio" e
-- passa a ser "as exceÃ§Ãµes dele" â€” a UI sÃ³ grava as chaves que divergem do
-- departamento.
--
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

-- ---------- 1. Tabela ----------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  description text not null default '',
  -- { "conversas": true, "pagamentos": false, ... } â€” mapa completo dos mÃ³dulos
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Dois departamentos com o mesmo nome na mesma empresa sÃ³ geram confusÃ£o.
create unique index if not exists departments_location_name_idx
  on public.departments (location_id, lower(name));

-- `on delete set null`: apagar um departamento nÃ£o pode derrubar o acesso de
-- ninguÃ©m â€” o usuÃ¡rio volta a ser regido sÃ³ pelas exceÃ§Ãµes dele.
alter table public.location_members
  add column if not exists department_id uuid references public.departments (id) on delete set null;

create index if not exists location_members_department_idx
  on public.location_members (department_id);

-- ---------- 2. RLS: todo membro lÃª, sÃ³ admin escreve ----------

alter table public.departments enable row level security;
revoke all on public.departments from anon;

drop policy if exists "membros leem departamentos" on public.departments;
create policy "membros leem departamentos" on public.departments
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "admins criam departamentos" on public.departments;
create policy "admins criam departamentos" on public.departments
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins editam departamentos" on public.departments;
create policy "admins editam departamentos" on public.departments
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem departamentos" on public.departments;
create policy "admins excluem departamentos" on public.departments
  for delete to authenticated
  using (private.is_admin(location_id));

-- ---------- 3. Departamentos padrÃ£o ----------

-- Chaves = `key` de NAV_ITEMS em src/lib/config/nav.ts. Mapa COMPLETO de
-- propÃ³sito: `false` explÃ­cito Ã© mais fÃ¡cil de auditar do que ausÃªncia.
create or replace function private.seed_default_departments(loc uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.departments (location_id, name, description, permissions)
  values (
    loc,
    'Secretaria',
    'Atendimento, agenda e acompanhamento de alunos.',
    jsonb_build_object(
      'dashboard', true, 'conversas', true, 'calendarios', true, 'contatos', true,
      'leads', true, 'automacoes', true, 'agentes-ia', true, 'assinaturas', true,
      'midia', true,
      'pagamentos', false, 'ai-studio', false, 'marketing', false, 'sites', false,
      'reputacao', false, 'relatorios', false, 'marketplace', false, 'whatsapp', false
    )
  )
  on conflict do nothing;

  insert into public.departments (location_id, name, description, permissions)
  values (
    loc,
    'Comercial',
    'ProspecÃ§Ã£o, negociaÃ§Ã£o e fechamento de matrÃ­culas.',
    jsonb_build_object(
      'dashboard', true, 'conversas', true, 'calendarios', true, 'contatos', true,
      'leads', true, 'automacoes', true, 'agentes-ia', true, 'midia', true,
      'assinaturas', false,
      'pagamentos', false, 'ai-studio', false, 'marketing', false, 'sites', false,
      'reputacao', false, 'relatorios', false, 'marketplace', false, 'whatsapp', false
    )
  )
  on conflict do nothing;
end;
$$;

revoke all on function private.seed_default_departments(uuid) from public, anon, authenticated;

-- Empresas que jÃ¡ existem.
do $$
declare l record;
begin
  for l in select id from public.locations loop
    perform private.seed_default_departments(l.id);
  end loop;
end $$;

-- Empresas novas: gatilho prÃ³prio em vez de mexer no `handle_new_user`, que Ã©
-- compartilhado e jÃ¡ faz perfil + location + pipeline padrÃ£o.
create or replace function private.on_location_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_departments(new.id);
  return new;
end;
$$;

drop trigger if exists seed_departments_on_location on public.locations;
create trigger seed_departments_on_location
  after insert on public.locations
  for each row execute function private.on_location_created();

-- ---------- 4. Convite jÃ¡ sai com departamento ----------

alter table public.invitations
  add column if not exists department_id uuid references public.departments (id) on delete set null;

-- O `private.handle_new_user` (0006) Ã© quem cria o location_members a partir do
-- convite. Em vez de reescrevÃª-lo â€” funÃ§Ã£o compartilhada, que o outro Claude
-- tambÃ©m mexe â€”, um gatilho aditivo copia o departamento depois do insert.
create or replace function private.apply_invite_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_email text;
  dep uuid;
begin
  if new.department_id is not null then
    return new; -- jÃ¡ veio definido
  end if;

  select u.email into invited_email from auth.users u where u.id = new.user_id;
  if invited_email is null then
    return new;
  end if;

  select i.department_id into dep
  from public.invitations i
  where i.location_id = new.location_id
    and lower(i.email) = lower(invited_email)
    and i.department_id is not null
  order by i.created_at desc
  limit 1;

  if dep is not null then
    update public.location_members
       set department_id = dep
     where location_id = new.location_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_invite_department() from public, anon, authenticated;

drop trigger if exists apply_invite_department on public.location_members;
create trigger apply_invite_department
  after insert on public.location_members
  for each row execute function private.apply_invite_department();


-- ------------------------------------------------------------
-- 0034_company_logo.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Logo da empresa (whitelabel)
--
-- locations.logo_url guarda a URL pÃºblica do logo; o binÃ¡rio vai para o bucket
-- PÃšBLICO `branding` no caminho {location_id}/logo-{ts}.{ext}. Leitura liberada
-- (logo aparece no app e em e-mail); escrita/exclusÃ£o sÃ³ por membros da empresa,
-- escopadas pela pasta = location_id (mesmo padrÃ£o de payment-files/0015).
-- Setar logo_url em locations Ã© admin-only (a RLS de UPDATE de locations reforÃ§a).
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

alter table public.locations add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "logo leitura pÃºblica" on storage.objects;
create policy "logo leitura pÃºblica" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "membros gravam logo" on storage.objects;
create policy "membros gravam logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros atualizam logo" on storage.objects;
create policy "membros atualizam logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  )
  with check (
    bucket_id = 'branding'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros apagam logo" on storage.objects;
create policy "membros apagam logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );


-- ------------------------------------------------------------
-- 0035_departamento_canais.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” SegmentaÃ§Ã£o de conversas por nÃºmero (canal) do WhatsApp
--
-- O departamento jÃ¡ dizia QUAIS MÃ“DULOS a pessoa acessa (0033). Agora diz
-- tambÃ©m DE QUAIS NÃšMEROS ela vÃª conversa.
--
-- Regras decididas com o Gabriel (2026-08-14):
--   1. O vÃ­nculo Ã© do DEPARTAMENTO, nÃ£o da pessoa: nÃºmero ligado ao Comercial
--      vale para todo o Comercial.
--   2. Departamento sem nÃºmero vinculado = sem restriÃ§Ã£o (vÃª tudo). Assim
--      nenhum departamento existente perde acesso ao aplicar esta migraÃ§Ã£o.
--   3. Conversa SEM canal (e-mail, Instagram, WhatsApp antigo sem nÃºmero)
--      continua visÃ­vel para todos â€” a restriÃ§Ã£o vale sÃ³ para o WhatsApp que
--      jÃ¡ tem nÃºmero vinculado.
--   4. Administrador vÃª tudo, como no resto do sistema.
--
-- Isso Ã© RLS de verdade, nÃ£o filtro de tela: quem nÃ£o pode ver a conversa nÃ£o
-- a recebe nem pela API.
--
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

-- ---------- 1. VÃ­nculo departamento â†” nÃºmero ----------

create table if not exists public.department_channels (
  department_id uuid not null references public.departments (id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, channel_id)
);

create index if not exists department_channels_channel_idx
  on public.department_channels (channel_id);

alter table public.department_channels enable row level security;
revoke all on public.department_channels from anon;

drop policy if exists "membros leem canais do depto" on public.department_channels;
create policy "membros leem canais do depto" on public.department_channels
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "admins criam canais do depto" on public.department_channels;
create policy "admins criam canais do depto" on public.department_channels
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem canais do depto" on public.department_channels;
create policy "admins excluem canais do depto" on public.department_channels
  for delete to authenticated
  using (private.is_admin(location_id));

-- ---------- 2. O usuÃ¡rio pode ver este canal? ----------

-- SECURITY DEFINER porque consulta location_members/department_channels, que
-- tÃªm RLS prÃ³pria â€” mesmo padrÃ£o de private.user_locations().
create or replace function private.channel_allowed(loc uuid, chan uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    -- 3: conversa sem nÃºmero nÃ£o entra na segmentaÃ§Ã£o
    chan is null
    -- 4: admin vÃª tudo
    or private.is_admin(loc)
    -- 2: departamento sem nÃºmero vinculado (ou usuÃ¡rio sem departamento) = sem restriÃ§Ã£o
    or not exists (
      select 1
        from public.location_members lm
        join public.department_channels dc on dc.department_id = lm.department_id
       where lm.user_id = auth.uid()
         and lm.location_id = loc
    )
    -- 1: o nÃºmero estÃ¡ entre os do departamento da pessoa
    or exists (
      select 1
        from public.location_members lm
        join public.department_channels dc on dc.department_id = lm.department_id
       where lm.user_id = auth.uid()
         and lm.location_id = loc
         and dc.channel_id = chan
    );
$$;

revoke all on function private.channel_allowed(uuid, uuid) from public, anon;
grant execute on function private.channel_allowed(uuid, uuid) to authenticated;

-- ---------- 3. Aplicar nas conversas e mensagens ----------

-- As policies "membros leem"/"membros editam" vÃªm do laÃ§o da 0001. Recriadas
-- aqui com o filtro de canal por cima do filtro de empresa â€” o de empresa
-- continua igual, nÃ£o Ã© afrouxado em nada.
drop policy if exists "membros leem" on public.conversations;
create policy "membros leem" on public.conversations
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros editam" on public.conversations;
create policy "membros editam" on public.conversations
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros leem" on public.messages;
create policy "membros leem" on public.messages
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros editam" on public.messages;
create policy "membros editam" on public.messages
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

-- Enviar mensagem num canal que a pessoa nÃ£o enxerga tambÃ©m nÃ£o pode.
drop policy if exists "membros criam" on public.messages;
create policy "membros criam" on public.messages
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );


-- ------------------------------------------------------------
-- 0036_pagamentos_status_membros.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Pagamentos: todo membro enxerga a conexÃ£o da Guru
--
-- Bug: um usuÃ¡rio nÃ£o-administrador abria Pagamentos e via a tela de
-- "Conectar Guru", como se a empresa nÃ£o tivesse integraÃ§Ã£o. Causa: desde a
-- 0008, `payment_credentials` sÃ³ Ã© legÃ­vel por admin (`private.is_admin`) â€”
-- e com razÃ£o, porque a tabela guarda o Account Token e o User Token da Guru.
-- Sem a linha, o app concluÃ­a `connected = false`.
--
-- A conexÃ£o Ã© da EMPRESA, nÃ£o de quem estÃ¡ logado. Esta view expÃµe sÃ³ o
-- ESTADO da integraÃ§Ã£o â€” sem nenhum token â€” para qualquer membro:
--
--   * quem Ã© membro sabe que a Guru estÃ¡ conectada e quando sincronizou;
--   * ninguÃ©m alÃ©m do admin lÃª `api_key`/`webhook_token`, que continuam
--     protegidos pela RLS original (nÃ£o mexo nela).
--
-- ATENÃ‡ÃƒO â€” esta view Ã© SECURITY DEFINER de propÃ³sito (sem
-- `security_invoker = on`, ao contrÃ¡rio das outras views do projeto): ela
-- precisa justamente contornar a RLS admin-only da tabela base. Por isso o
-- isolamento entre empresas Ã© feito AQUI DENTRO, no `where` com
-- `private.user_locations()`. Se alguÃ©m remover esse where, vaza o estado de
-- integraÃ§Ã£o de outras empresas.
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


-- ------------------------------------------------------------
-- 0037_dashboard_views.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Painel de controle: visualizaÃ§Ãµes por usuÃ¡rio e por departamento
--
-- O seletor de painÃ©is do topo era decorativo: trÃªs nomes fixos no cÃ³digo
-- ("(PadrÃ£o) VisÃ£o Geral", "SDR Acompanhamento", "Funil Comercial") e um
-- "Adicionar painel" que sÃ³ emitia toast. Esta tabela dÃ¡ lastro a ele.
--
-- Cada linha Ã© um painel: quais widgets aparecem, em que ordem, e a
-- configuraÃ§Ã£o de cada um (ex.: qual pipeline o funil resume).
--
-- DOIS ESCOPOS na mesma tabela:
--   * scope = 'user'       â†’ painel pessoal, sÃ³ o dono lÃª e edita.
--   * scope = 'department' â†’ painel montado pelo ADMIN para um departamento;
--                            todo mundo daquele departamento enxerga, mas sÃ³
--                            admin cria/edita/apaga.
--
-- Um escopo sÃ³ por linha (o check garante): painel de departamento nÃ£o tem
-- dono individual, painel pessoal nÃ£o tem departamento. Guardar os dois na
-- mesma tabela mantÃ©m uma consulta sÃ³ no seletor â€” que precisa listar as duas
-- coisas juntas de qualquer forma.
--
-- Diferente de `inbox_views` (0027), que Ã© da empresa inteira e todo mundo
-- enxerga. O `location_id` continua nos dois escopos porque o mesmo usuÃ¡rio
-- pode ser membro de mais de uma empresa e os ids de pipeline de uma nÃ£o
-- existem na outra.
--
-- PadrÃ£o multi-tenant de sempre: RLS, revoke do anon, UPDATE com
-- USING + WITH CHECK. Idempotente.
-- ============================================================

create table if not exists public.dashboard_views (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  scope text not null default 'user' check (scope in ('user', 'department')),
  user_id uuid references auth.users (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  name text not null,
  -- [{ "key": "funil", "pipelineId": "<uuid>" }, ...] â€” a ORDEM do array Ã© a
  -- ordem na tela; widget ausente do array Ã© widget escondido.
  widgets jsonb not null default '[]'::jsonb,
  -- Painel que abre por padrÃ£o dentro do prÃ³prio escopo.
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_views_scope_owner check (
    (scope = 'user' and user_id is not null and department_id is null)
    or (scope = 'department' and department_id is not null and user_id is null)
  )
);

create index if not exists dashboard_views_owner_idx
  on public.dashboard_views (user_id, location_id, created_at);

create index if not exists dashboard_views_department_idx
  on public.dashboard_views (department_id, created_at);

-- SÃ³ um padrÃ£o por usuÃ¡rio em cada empresa, e um por departamento. Ãndices
-- parciais Ãºnicos: o banco garante isso mesmo se duas abas marcarem padrÃ£o ao
-- mesmo tempo.
create unique index if not exists dashboard_views_one_default_idx
  on public.dashboard_views (user_id, location_id)
  where is_default and scope = 'user';

create unique index if not exists dashboard_views_one_dept_default_idx
  on public.dashboard_views (department_id)
  where is_default and scope = 'department';

-- ---------- Quem enxerga painel de departamento ----------
-- SECURITY DEFINER pelo mesmo motivo de `private.channel_allowed`: a policy
-- consulta `location_members`, que tem RLS prÃ³pria â€” sem o definer a
-- subconsulta enxergaria sÃ³ o que o usuÃ¡rio jÃ¡ pode ver e a regra ficaria
-- circular.
create or replace function private.user_department_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select lm.department_id
    from public.location_members lm
   where lm.user_id = auth.uid()
     and lm.department_id is not null;
$$;

revoke all on function private.user_department_ids() from public, anon;
grant execute on function private.user_department_ids() to authenticated;

alter table public.dashboard_views enable row level security;
revoke all on public.dashboard_views from anon;

-- Leitura: o prÃ³prio painel, o do meu departamento, ou tudo se for admin
-- (admin precisa enxergar para editar os painÃ©is dos departamentos).
-- Sempre dentro da empresa: sÃ³ `user_id` deixaria um ex-membro continuar
-- lendo o painel de uma empresa da qual saiu.
drop policy if exists "leitura de paineis" on public.dashboard_views;
create policy "leitura de paineis" on public.dashboard_views
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      user_id = (select auth.uid())
      or department_id in (select private.user_department_ids())
      or private.is_admin(location_id)
    )
  );

-- Escrita: painel pessoal Ã© do dono; painel de departamento Ã© sÃ³ do admin.
drop policy if exists "cria paineis" on public.dashboard_views;
create policy "cria paineis" on public.dashboard_views
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'department' and private.is_admin(location_id))
    )
  );

drop policy if exists "edita paineis" on public.dashboard_views;
create policy "edita paineis" on public.dashboard_views
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'department' and private.is_admin(location_id))
    )
  )
  with check (
    location_id in (select private.user_locations())
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'department' and private.is_admin(location_id))
    )
  );

drop policy if exists "exclui paineis" on public.dashboard_views;
create policy "exclui paineis" on public.dashboard_views
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'department' and private.is_admin(location_id))
    )
  );

-- VersÃµes anteriores desta migraÃ§Ã£o criaram polÃ­ticas com outros nomes; some
-- com elas para nÃ£o ficarem duas regras concorrentes na mesma tabela.
drop policy if exists "dono lÃª seus paineis" on public.dashboard_views;
drop policy if exists "dono cria seus paineis" on public.dashboard_views;
drop policy if exists "dono edita seus paineis" on public.dashboard_views;
drop policy if exists "dono exclui seus paineis" on public.dashboard_views;


-- ------------------------------------------------------------
-- 0038_message_type_video.sql
-- ------------------------------------------------------------
-- Lito CRM â€” permite mensagens do tipo 'video' (mÃ­dia real do WhatsApp).
-- Idempotente (drop + add da constraint). Aplicar no SQL Editor.
set check_function_bodies = off;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'audio', 'image', 'file', 'event', 'video'));


-- ------------------------------------------------------------
-- 0039_pipelines_segmentacao.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Leads: segmentaÃ§Ã£o dos PIPELINES
--
-- O pipeline jÃ¡ Ã© a forma de visualizar os leads; o que faltava era dizer de
-- QUEM ele Ã©. AtÃ© aqui todo pipeline era da empresa inteira: qualquer usuÃ¡rio
-- criava um funil e ele aparecia para todo mundo.
--
-- TrÃªs escopos:
--   * 'empresa'    â†’ todo mundo vÃª (Ã© o que todos os pipelines de hoje viram,
--                    entÃ£o nada muda para os dados existentes).
--   * 'department' â†’ sÃ³ quem Ã© daquele departamento (+ admin).
--   * 'user'       â†’ sÃ³ o dono (+ admin).
--
-- Quem cria o quÃª:
--   * usuÃ¡rio comum sÃ³ cria pipeline 'user' com owner_id = ele mesmo;
--   * admin cria em qualquer escopo e escolhe o departamento ou o dono.
-- Isso Ã© RLS, nÃ£o regra de tela: sem o `with check` abaixo, qualquer usuÃ¡rio
-- poderia inserir um pipeline 'empresa' chamando a API direto.
--
-- A visibilidade contamina o que pende do pipeline: `stages` e `opportunities`
-- de um pipeline invisÃ­vel nÃ£o podem aparecer, senÃ£o o lead vazaria pelo
-- dashboard, pela busca ou pela API mesmo com o funil escondido.
--
-- Idempotente.
-- ============================================================

-- ---------- 1. Colunas de escopo ----------

alter table public.pipelines
  add column if not exists scope text not null default 'empresa',
  add column if not exists department_id uuid references public.departments (id) on delete cascade,
  add column if not exists owner_id uuid references auth.users (id) on delete cascade,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- `add constraint if not exists` nÃ£o existe no Postgres; daÃ­ o guard.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipelines_scope_check'
  ) then
    alter table public.pipelines
      add constraint pipelines_scope_check
      check (scope in ('empresa', 'department', 'user'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pipelines_scope_owner'
  ) then
    alter table public.pipelines
      add constraint pipelines_scope_owner check (
        (scope = 'empresa' and department_id is null and owner_id is null)
        or (scope = 'department' and department_id is not null and owner_id is null)
        or (scope = 'user' and owner_id is not null and department_id is null)
      );
  end if;
end;
$$;

create index if not exists pipelines_scope_idx
  on public.pipelines (location_id, scope);

-- ---------- 2. Helpers ----------

-- Criada na 0037; repetida aqui (create or replace) para esta migraÃ§Ã£o nÃ£o
-- depender da ordem de aplicaÃ§Ã£o.
create or replace function private.user_department_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select lm.department_id
    from public.location_members lm
   where lm.user_id = auth.uid()
     and lm.department_id is not null;
$$;

revoke all on function private.user_department_ids() from public, anon;
grant execute on function private.user_department_ids() to authenticated;

-- "Este pipeline Ã© visÃ­vel para mim?" â€” usada pelas policies de stages e
-- opportunities. SECURITY DEFINER pelo mesmo motivo de `private.channel_allowed`
-- (0035): consulta tabelas com RLS prÃ³pria e a regra ficaria circular.
create or replace function private.pipeline_visible(pipe uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.pipelines p
     where p.id = pipe
       and (
         p.scope = 'empresa'
         or private.is_admin(p.location_id)
         or (p.scope = 'user' and p.owner_id = auth.uid())
         or (p.scope = 'department' and p.department_id in (select private.user_department_ids()))
       )
  );
$$;

revoke all on function private.pipeline_visible(uuid) from public, anon;
grant execute on function private.pipeline_visible(uuid) to authenticated;

-- "Posso administrar este pipeline?" â€” admin sempre; o dono, no escopo 'user'.
create or replace function private.pipeline_manageable(pipe uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.pipelines p
     where p.id = pipe
       and (
         private.is_admin(p.location_id)
         or (p.scope = 'user' and p.owner_id = auth.uid())
         -- Pipeline da empresa/departamento continua editÃ¡vel por qualquer
         -- membro que o enxerga: era assim antes desta migraÃ§Ã£o e restringir
         -- agora tiraria de gente que jÃ¡ organiza o prÃ³prio funil.
         or (p.scope <> 'user' and private.pipeline_visible(p.id))
       )
  );
$$;

revoke all on function private.pipeline_manageable(uuid) from public, anon;
grant execute on function private.pipeline_manageable(uuid) to authenticated;

-- ---------- 3. Policies de pipelines ----------
-- As policies "membros ..." vÃªm do laÃ§o da 0001. Recriadas com o escopo por
-- cima do filtro de empresa â€” o de empresa continua igual, nÃ£o Ã© afrouxado.

drop policy if exists "membros leem" on public.pipelines;
create policy "membros leem" on public.pipelines
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      scope = 'empresa'
      or private.is_admin(location_id)
      or (scope = 'user' and owner_id = (select auth.uid()))
      or (scope = 'department' and department_id in (select private.user_department_ids()))
    )
  );

-- Criar: admin em qualquer escopo; usuÃ¡rio comum sÃ³ o prÃ³prio pipeline.
drop policy if exists "membros criam" on public.pipelines;
create policy "membros criam" on public.pipelines
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and (
      private.is_admin(location_id)
      or (scope = 'user' and owner_id = (select auth.uid()))
    )
  );

drop policy if exists "membros editam" on public.pipelines;
create policy "membros editam" on public.pipelines
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      private.is_admin(location_id)
      or (scope = 'user' and owner_id = (select auth.uid()))
      or (scope <> 'user' and (
        scope = 'empresa'
        or department_id in (select private.user_department_ids())
      ))
    )
  )
  with check (
    location_id in (select private.user_locations())
    and (
      -- SÃ³ admin muda o escopo para algo que nÃ£o seja "meu". Sem o with check,
      -- um usuÃ¡rio comum promoveria o prÃ³prio pipeline a 'empresa'.
      private.is_admin(location_id)
      or (scope = 'user' and owner_id = (select auth.uid()))
    )
  );

drop policy if exists "membros excluem" on public.pipelines;
create policy "membros excluem" on public.pipelines
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      private.is_admin(location_id)
      or (scope = 'user' and owner_id = (select auth.uid()))
    )
  );

-- ---------- 4. Fases seguem o pipeline ----------

drop policy if exists "membros leem" on public.stages;
create policy "membros leem" on public.stages
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and private.pipeline_visible(pipeline_id)
  );

drop policy if exists "membros criam" on public.stages;
create policy "membros criam" on public.stages
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and private.pipeline_manageable(pipeline_id)
  );

drop policy if exists "membros editam" on public.stages;
create policy "membros editam" on public.stages
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and private.pipeline_manageable(pipeline_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.pipeline_manageable(pipeline_id)
  );

drop policy if exists "membros excluem" on public.stages;
create policy "membros excluem" on public.stages
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and private.pipeline_manageable(pipeline_id)
  );

-- ---------- 5. Oportunidades seguem o pipeline ----------
-- âš ï¸ Estas policies vÃªm da 0004 ("ver apenas dados atribuÃ­dos", via
-- private.sees_all). O filtro de lÃ¡ Ã© MANTIDO â€” sÃ³ ganha o de pipeline por
-- cima. Ao mexer nelas de novo, preserve as duas condiÃ§Ãµes.

drop policy if exists "membros leem" on public.opportunities;
create policy "membros leem" on public.opportunities
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and (private.sees_all(location_id) or owner_id = (select auth.uid()))
    and private.pipeline_visible(pipeline_id)
  );

drop policy if exists "membros criam" on public.opportunities;
create policy "membros criam" on public.opportunities
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and private.pipeline_visible(pipeline_id)
  );

drop policy if exists "membros editam" on public.opportunities;
create policy "membros editam" on public.opportunities
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and (private.sees_all(location_id) or owner_id = (select auth.uid()))
    and private.pipeline_visible(pipeline_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.pipeline_visible(pipeline_id)
  );

drop policy if exists "membros excluem" on public.opportunities;
create policy "membros excluem" on public.opportunities
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and (private.sees_all(location_id) or owner_id = (select auth.uid()))
    and private.pipeline_visible(pipeline_id)
  );

-- ---------- 6. Pipeline padrÃ£o do onboarding ----------
-- `private.handle_new_user` cria o pipeline inicial sem escopo; o default
-- 'empresa' jÃ¡ cobre isso â€” nada a mudar lÃ¡.


-- ------------------------------------------------------------
-- 0040_conversas_excluir_admin.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversas: sÃ³ administrador exclui
--
-- Excluir uma conversa apaga o histÃ³rico do atendimento junto (as mensagens
-- caem por ON DELETE CASCADE) e nÃ£o tem desfazer. Isso Ã© decisÃ£o de
-- administrador, nÃ£o de qualquer atendente â€” para tirar da vista existe
-- "Arquivar" (0029), que nÃ£o destrÃ³i nada.
--
-- Esconder o botÃ£o na tela nÃ£o bastaria: as policies "membros excluem" das
-- duas tabelas vÃªm do laÃ§o da 0001 e deixam qualquer membro apagar chamando a
-- API direto.
--
-- `messages` entra junto de propÃ³sito: sem isso um usuÃ¡rio comum continuaria
-- conseguindo esvaziar a conversa mensagem por mensagem â€” o mesmo estrago,
-- por outro caminho. (A exclusÃ£o em cascata, disparada ao apagar a conversa,
-- nÃ£o passa por RLS, entÃ£o o admin continua excluindo tudo normalmente.)
--
-- Idempotente: derruba tanto a policy antiga quanto a nova antes de criar.
-- ============================================================

drop policy if exists "membros excluem" on public.conversations;
drop policy if exists "admin exclui conversas" on public.conversations;
create policy "admin exclui conversas" on public.conversations
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and private.is_admin(location_id)
  );

drop policy if exists "membros excluem" on public.messages;
drop policy if exists "admin exclui mensagens" on public.messages;
create policy "admin exclui mensagens" on public.messages
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and private.is_admin(location_id)
  );


-- ------------------------------------------------------------
-- 0041_compromissos_lead.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” CalendÃ¡rios: compromisso vinculado a um lead
--
-- O compromisso jÃ¡ podia apontar para um contato; faltava apontar para a
-- OPORTUNIDADE (o lead no funil) â€” Ã© o que responde "essa reuniÃ£o Ã© de qual
-- negociaÃ§Ã£o?" quando o mesmo contato tem mais de uma.
--
-- `on delete set null` (e nÃ£o cascade): excluir a oportunidade nÃ£o pode apagar
-- a reuniÃ£o da agenda de ninguÃ©m. O compromisso continua lÃ¡, sÃ³ perde o
-- vÃ­nculo â€” mesmo critÃ©rio do `contact_id` na 0001.
--
-- Sem policy nova: `appointments` jÃ¡ tem RLS de membership desde a 0001, e a
-- coluna entra na mesma linha.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists opportunity_id uuid
    references public.opportunities (id) on delete set null;

-- Ãndice para "quais compromissos sÃ£o deste lead?" â€” a consulta do detalhe da
-- oportunidade. Parcial: a grande maioria dos compromissos nÃ£o tem lead.
create index if not exists appointments_opportunity_idx
  on public.appointments (opportunity_id)
  where opportunity_id is not null;


-- ------------------------------------------------------------
-- 0042_compromissos_lembrete.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” CalendÃ¡rios: lembrete do compromisso dentro do CRM
--
-- Quantos minutos antes do inÃ­cio o CRM deve avisar quem estiver com a
-- plataforma aberta. `null` = sem lembrete (Ã© o default, entÃ£o nenhum
-- compromisso existente passa a avisar do nada).
--
-- Guardado no compromisso, e nÃ£o numa preferÃªncia do usuÃ¡rio: o aviso Ã© da
-- REUNIÃƒO. "Avisar 1 dia antes" faz sentido para uma visita e Ã© ruÃ­do para um
-- retorno de 10 minutos â€” quem marca decide, e vale para todo mundo que
-- enxerga aquele compromisso.
--
-- SÃ³ o "jÃ¡ avisei" fica FORA do banco (localStorage do navegador): Ã© estado de
-- tela, por dispositivo. Marcar no banco esconderia o aviso no computador
-- porque o celular mostrou primeiro.
--
-- Sem policy nova: `appointments` jÃ¡ tem RLS de membership desde a 0001 e a
-- coluna entra na mesma linha.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists reminder_minutes int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_reminder_minutes_check'
  ) then
    -- Teto de 7 dias: acima disso o aviso deixa de ser lembrete e vira
    -- ruÃ­do de semanas antes.
    alter table public.appointments
      add constraint appointments_reminder_minutes_check
      check (reminder_minutes is null or (reminder_minutes >= 0 and reminder_minutes <= 10080));
  end if;
end;
$$;


-- ------------------------------------------------------------
-- 0043_compromissos_por_usuario.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” CalendÃ¡rios: agenda por usuÃ¡rio
--
-- AtÃ© aqui a agenda era uma sÃ³: todo membro via (e apagava) o compromisso de
-- qualquer um. Agora cada compromisso tem dono e cada pessoa vÃª a prÃ³pria
-- agenda; administrador vÃª tudo.
--
-- `owner_id` NULO = compromisso da empresa, visÃ­vel para todos. Ã‰ o que os
-- compromissos JÃ EXISTENTES viram: nÃ£o hÃ¡ como adivinhar quem os criou, e
-- fazÃª-los sumir da agenda de todo mundo seria pior do que mantÃª-los
-- compartilhados. Os novos nascem com dono (o criador, ou quem o admin
-- escolher).
--
-- Isso Ã© RLS, nÃ£o filtro de tela: sem as policies abaixo, a agenda alheia
-- continuaria a um GET de distÃ¢ncia.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists appointments_owner_idx
  on public.appointments (location_id, owner_id);

-- ---------- Policies (recriam as do laÃ§o da 0001) ----------

drop policy if exists "membros leem" on public.appointments;
drop policy if exists "agenda: leitura" on public.appointments;
create policy "agenda: leitura" on public.appointments
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

-- Criar para si mesmo, ou sem dono (compromisso da empresa). SÃ³ admin cria na
-- agenda de outra pessoa â€” senÃ£o qualquer um lotaria o calendÃ¡rio do colega.
drop policy if exists "membros criam" on public.appointments;
drop policy if exists "agenda: criacao" on public.appointments;
create policy "agenda: criacao" on public.appointments
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

drop policy if exists "membros editam" on public.appointments;
drop policy if exists "agenda: edicao" on public.appointments;
create policy "agenda: edicao" on public.appointments
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  )
  with check (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

drop policy if exists "membros excluem" on public.appointments;
drop policy if exists "agenda: exclusao" on public.appointments;
create policy "agenda: exclusao" on public.appointments
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );


