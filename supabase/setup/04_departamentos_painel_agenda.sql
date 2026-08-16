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
-- CRM ON — Departamentos (segmentação de acesso padrão)
--
-- Até aqui a permissão por módulo era individual: cada usuário tinha seu
-- `location_members.permissions`, e montar um perfil novo era repetir a mesma
-- lista de módulos na mão. Departamento passa a ser a base compartilhada.
--
-- Como as permissões efetivas são resolvidas (decisão do Gabriel, 2026-08-14):
--   1. Administrador vê tudo — departamento não se aplica a ele. Isso evita a
--      empresa se trancar fora de Configurações.
--   2. Exceção individual vence: se `location_members.permissions` tiver a
--      chave do módulo, ela manda.
--   3. Senão, vale o `permissions` do departamento do usuário.
--   4. Sem departamento e sem exceção, libera (mantém o comportamento dos
--      membros antigos, que têm `permissions = {}` e enxergam tudo).
--
-- Por isso `location_members.permissions` deixa de ser "o acesso do usuário" e
-- passa a ser "as exceções dele" — a UI só grava as chaves que divergem do
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
  -- { "conversas": true, "pagamentos": false, ... } — mapa completo dos módulos
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Dois departamentos com o mesmo nome na mesma empresa só geram confusão.
create unique index if not exists departments_location_name_idx
  on public.departments (location_id, lower(name));

-- `on delete set null`: apagar um departamento não pode derrubar o acesso de
-- ninguém — o usuário volta a ser regido só pelas exceções dele.
alter table public.location_members
  add column if not exists department_id uuid references public.departments (id) on delete set null;

create index if not exists location_members_department_idx
  on public.location_members (department_id);

-- ---------- 2. RLS: todo membro lê, só admin escreve ----------

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

-- ---------- 3. Departamentos padrão ----------

-- Chaves = `key` de NAV_ITEMS em src/lib/config/nav.ts. Mapa COMPLETO de
-- propósito: `false` explícito é mais fácil de auditar do que ausência.
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
    'Prospecção, negociação e fechamento de matrículas.',
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

-- Empresas que já existem.
do $$
declare l record;
begin
  for l in select id from public.locations loop
    perform private.seed_default_departments(l.id);
  end loop;
end $$;

-- Empresas novas: gatilho próprio em vez de mexer no `handle_new_user`, que é
-- compartilhado e já faz perfil + location + pipeline padrão.
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

-- ---------- 4. Convite já sai com departamento ----------

alter table public.invitations
  add column if not exists department_id uuid references public.departments (id) on delete set null;

-- O `private.handle_new_user` (0006) é quem cria o location_members a partir do
-- convite. Em vez de reescrevê-lo — função compartilhada, que o outro Claude
-- também mexe —, um gatilho aditivo copia o departamento depois do insert.
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
    return new; -- já veio definido
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
-- CRM ON — Logo da empresa (whitelabel)
--
-- locations.logo_url guarda a URL pública do logo; o binário vai para o bucket
-- PÚBLICO `branding` no caminho {location_id}/logo-{ts}.{ext}. Leitura liberada
-- (logo aparece no app e em e-mail); escrita/exclusão só por membros da empresa,
-- escopadas pela pasta = location_id (mesmo padrão de payment-files/0015).
-- Setar logo_url em locations é admin-only (a RLS de UPDATE de locations reforça).
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

alter table public.locations add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "logo leitura pública" on storage.objects;
create policy "logo leitura pública" on storage.objects
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
-- CRM ON — Segmentação de conversas por número (canal) do WhatsApp
--
-- O departamento já dizia QUAIS MÓDULOS a pessoa acessa (0033). Agora diz
-- também DE QUAIS NÚMEROS ela vê conversa.
--
-- Regras decididas com o Gabriel (2026-08-14):
--   1. O vínculo é do DEPARTAMENTO, não da pessoa: número ligado ao Comercial
--      vale para todo o Comercial.
--   2. Departamento sem número vinculado = sem restrição (vê tudo). Assim
--      nenhum departamento existente perde acesso ao aplicar esta migração.
--   3. Conversa SEM canal (e-mail, Instagram, WhatsApp antigo sem número)
--      continua visível para todos — a restrição vale só para o WhatsApp que
--      já tem número vinculado.
--   4. Administrador vê tudo, como no resto do sistema.
--
-- Isso é RLS de verdade, não filtro de tela: quem não pode ver a conversa não
-- a recebe nem pela API.
--
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

-- ---------- 1. Vínculo departamento ↔ número ----------

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

-- ---------- 2. O usuário pode ver este canal? ----------

-- SECURITY DEFINER porque consulta location_members/department_channels, que
-- têm RLS própria — mesmo padrão de private.user_locations().
create or replace function private.channel_allowed(loc uuid, chan uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    -- 3: conversa sem número não entra na segmentação
    chan is null
    -- 4: admin vê tudo
    or private.is_admin(loc)
    -- 2: departamento sem número vinculado (ou usuário sem departamento) = sem restrição
    or not exists (
      select 1
        from public.location_members lm
        join public.department_channels dc on dc.department_id = lm.department_id
       where lm.user_id = auth.uid()
         and lm.location_id = loc
    )
    -- 1: o número está entre os do departamento da pessoa
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

-- As policies "membros leem"/"membros editam" vêm do laço da 0001. Recriadas
-- aqui com o filtro de canal por cima do filtro de empresa — o de empresa
-- continua igual, não é afrouxado em nada.
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

-- Enviar mensagem num canal que a pessoa não enxerga também não pode.
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


-- ------------------------------------------------------------
-- 0037_dashboard_views.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Painel de controle: visualizações por usuário e por departamento
--
-- O seletor de painéis do topo era decorativo: três nomes fixos no código
-- ("(Padrão) Visão Geral", "SDR Acompanhamento", "Funil Comercial") e um
-- "Adicionar painel" que só emitia toast. Esta tabela dá lastro a ele.
--
-- Cada linha é um painel: quais widgets aparecem, em que ordem, e a
-- configuração de cada um (ex.: qual pipeline o funil resume).
--
-- DOIS ESCOPOS na mesma tabela:
--   * scope = 'user'       → painel pessoal, só o dono lê e edita.
--   * scope = 'department' → painel montado pelo ADMIN para um departamento;
--                            todo mundo daquele departamento enxerga, mas só
--                            admin cria/edita/apaga.
--
-- Um escopo só por linha (o check garante): painel de departamento não tem
-- dono individual, painel pessoal não tem departamento. Guardar os dois na
-- mesma tabela mantém uma consulta só no seletor — que precisa listar as duas
-- coisas juntas de qualquer forma.
--
-- Diferente de `inbox_views` (0027), que é da empresa inteira e todo mundo
-- enxerga. O `location_id` continua nos dois escopos porque o mesmo usuário
-- pode ser membro de mais de uma empresa e os ids de pipeline de uma não
-- existem na outra.
--
-- Padrão multi-tenant de sempre: RLS, revoke do anon, UPDATE com
-- USING + WITH CHECK. Idempotente.
-- ============================================================

create table if not exists public.dashboard_views (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  scope text not null default 'user' check (scope in ('user', 'department')),
  user_id uuid references auth.users (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  name text not null,
  -- [{ "key": "funil", "pipelineId": "<uuid>" }, ...] — a ORDEM do array é a
  -- ordem na tela; widget ausente do array é widget escondido.
  widgets jsonb not null default '[]'::jsonb,
  -- Painel que abre por padrão dentro do próprio escopo.
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

-- Só um padrão por usuário em cada empresa, e um por departamento. Índices
-- parciais únicos: o banco garante isso mesmo se duas abas marcarem padrão ao
-- mesmo tempo.
create unique index if not exists dashboard_views_one_default_idx
  on public.dashboard_views (user_id, location_id)
  where is_default and scope = 'user';

create unique index if not exists dashboard_views_one_dept_default_idx
  on public.dashboard_views (department_id)
  where is_default and scope = 'department';

-- ---------- Quem enxerga painel de departamento ----------
-- SECURITY DEFINER pelo mesmo motivo de `private.channel_allowed`: a policy
-- consulta `location_members`, que tem RLS própria — sem o definer a
-- subconsulta enxergaria só o que o usuário já pode ver e a regra ficaria
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

-- Leitura: o próprio painel, o do meu departamento, ou tudo se for admin
-- (admin precisa enxergar para editar os painéis dos departamentos).
-- Sempre dentro da empresa: só `user_id` deixaria um ex-membro continuar
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

-- Escrita: painel pessoal é do dono; painel de departamento é só do admin.
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

-- Versões anteriores desta migração criaram políticas com outros nomes; some
-- com elas para não ficarem duas regras concorrentes na mesma tabela.
drop policy if exists "dono lê seus paineis" on public.dashboard_views;
drop policy if exists "dono cria seus paineis" on public.dashboard_views;
drop policy if exists "dono edita seus paineis" on public.dashboard_views;
drop policy if exists "dono exclui seus paineis" on public.dashboard_views;


-- ------------------------------------------------------------
-- 0038_message_type_video.sql
-- ------------------------------------------------------------
-- CRM ON — permite mensagens do tipo 'video' (mídia real do WhatsApp).
-- Idempotente (drop + add da constraint). Aplicar no SQL Editor.
set check_function_bodies = off;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'audio', 'image', 'file', 'event', 'video'));


-- ------------------------------------------------------------
-- 0039_pipelines_segmentacao.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Leads: segmentação dos PIPELINES
--
-- O pipeline já é a forma de visualizar os leads; o que faltava era dizer de
-- QUEM ele é. Até aqui todo pipeline era da empresa inteira: qualquer usuário
-- criava um funil e ele aparecia para todo mundo.
--
-- Três escopos:
--   * 'empresa'    → todo mundo vê (é o que todos os pipelines de hoje viram,
--                    então nada muda para os dados existentes).
--   * 'department' → só quem é daquele departamento (+ admin).
--   * 'user'       → só o dono (+ admin).
--
-- Quem cria o quê:
--   * usuário comum só cria pipeline 'user' com owner_id = ele mesmo;
--   * admin cria em qualquer escopo e escolhe o departamento ou o dono.
-- Isso é RLS, não regra de tela: sem o `with check` abaixo, qualquer usuário
-- poderia inserir um pipeline 'empresa' chamando a API direto.
--
-- A visibilidade contamina o que pende do pipeline: `stages` e `opportunities`
-- de um pipeline invisível não podem aparecer, senão o lead vazaria pelo
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

-- `add constraint if not exists` não existe no Postgres; daí o guard.
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

-- Criada na 0037; repetida aqui (create or replace) para esta migração não
-- depender da ordem de aplicação.
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

-- "Este pipeline é visível para mim?" — usada pelas policies de stages e
-- opportunities. SECURITY DEFINER pelo mesmo motivo de `private.channel_allowed`
-- (0035): consulta tabelas com RLS própria e a regra ficaria circular.
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

-- "Posso administrar este pipeline?" — admin sempre; o dono, no escopo 'user'.
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
         -- Pipeline da empresa/departamento continua editável por qualquer
         -- membro que o enxerga: era assim antes desta migração e restringir
         -- agora tiraria de gente que já organiza o próprio funil.
         or (p.scope <> 'user' and private.pipeline_visible(p.id))
       )
  );
$$;

revoke all on function private.pipeline_manageable(uuid) from public, anon;
grant execute on function private.pipeline_manageable(uuid) to authenticated;

-- ---------- 3. Policies de pipelines ----------
-- As policies "membros ..." vêm do laço da 0001. Recriadas com o escopo por
-- cima do filtro de empresa — o de empresa continua igual, não é afrouxado.

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

-- Criar: admin em qualquer escopo; usuário comum só o próprio pipeline.
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
      -- Só admin muda o escopo para algo que não seja "meu". Sem o with check,
      -- um usuário comum promoveria o próprio pipeline a 'empresa'.
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
-- ⚠️ Estas policies vêm da 0004 ("ver apenas dados atribuídos", via
-- private.sees_all). O filtro de lá é MANTIDO — só ganha o de pipeline por
-- cima. Ao mexer nelas de novo, preserve as duas condições.

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

-- ---------- 6. Pipeline padrão do onboarding ----------
-- `private.handle_new_user` cria o pipeline inicial sem escopo; o default
-- 'empresa' já cobre isso — nada a mudar lá.


-- ------------------------------------------------------------
-- 0040_conversas_excluir_admin.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Conversas: só administrador exclui
--
-- Excluir uma conversa apaga o histórico do atendimento junto (as mensagens
-- caem por ON DELETE CASCADE) e não tem desfazer. Isso é decisão de
-- administrador, não de qualquer atendente — para tirar da vista existe
-- "Arquivar" (0029), que não destrói nada.
--
-- Esconder o botão na tela não bastaria: as policies "membros excluem" das
-- duas tabelas vêm do laço da 0001 e deixam qualquer membro apagar chamando a
-- API direto.
--
-- `messages` entra junto de propósito: sem isso um usuário comum continuaria
-- conseguindo esvaziar a conversa mensagem por mensagem — o mesmo estrago,
-- por outro caminho. (A exclusão em cascata, disparada ao apagar a conversa,
-- não passa por RLS, então o admin continua excluindo tudo normalmente.)
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
-- CRM ON — Calendários: compromisso vinculado a um lead
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


-- ------------------------------------------------------------
-- 0042_compromissos_lembrete.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Calendários: lembrete do compromisso dentro do CRM
--
-- Quantos minutos antes do início o CRM deve avisar quem estiver com a
-- plataforma aberta. `null` = sem lembrete (é o default, então nenhum
-- compromisso existente passa a avisar do nada).
--
-- Guardado no compromisso, e não numa preferência do usuário: o aviso é da
-- REUNIÃO. "Avisar 1 dia antes" faz sentido para uma visita e é ruído para um
-- retorno de 10 minutos — quem marca decide, e vale para todo mundo que
-- enxerga aquele compromisso.
--
-- Só o "já avisei" fica FORA do banco (localStorage do navegador): é estado de
-- tela, por dispositivo. Marcar no banco esconderia o aviso no computador
-- porque o celular mostrou primeiro.
--
-- Sem policy nova: `appointments` já tem RLS de membership desde a 0001 e a
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
    -- ruído de semanas antes.
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
-- CRM ON — Calendários: agenda por usuário
--
-- Até aqui a agenda era uma só: todo membro via (e apagava) o compromisso de
-- qualquer um. Agora cada compromisso tem dono e cada pessoa vê a própria
-- agenda; administrador vê tudo.
--
-- `owner_id` NULO = compromisso da empresa, visível para todos. É o que os
-- compromissos JÁ EXISTENTES viram: não há como adivinhar quem os criou, e
-- fazê-los sumir da agenda de todo mundo seria pior do que mantê-los
-- compartilhados. Os novos nascem com dono (o criador, ou quem o admin
-- escolher).
--
-- Isso é RLS, não filtro de tela: sem as policies abaixo, a agenda alheia
-- continuaria a um GET de distância.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists appointments_owner_idx
  on public.appointments (location_id, owner_id);

-- ---------- Policies (recriam as do laço da 0001) ----------

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

-- Criar para si mesmo, ou sem dono (compromisso da empresa). Só admin cria na
-- agenda de outra pessoa — senão qualquer um lotaria o calendário do colega.
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


-- ------------------------------------------------------------
-- 0044_grants_service_role.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0044 — privilégios do service_role no schema public
--
-- POR QUE ISTO EXISTE
--
-- Nenhuma migração anterior concede privilégio ao `service_role`: a 0001
-- apenas REVOGA do `anon` e, no projeto Supabase original, o resto vinha
-- dos default privileges daquele projeto. Num projeto novo esse default
-- não veio junto, e o Postgres responde:
--
--   42501  permission denied for table contacts
--   hint:  GRANT SELECT ON public.contacts TO service_role;
--
-- Consequência sem esta migração: tudo que usa `src/lib/supabase/admin.ts`
-- falha com 403 — motor de automações, motor de e-mail marketing, webhook
-- do WhatsApp e sincronização da Guru. E falha em silêncio, porque essas
-- rotas são máquina-a-máquina e ninguém está olhando a tela.
--
-- SEGURANÇA
--
-- Isto NÃO afrouxa a RLS para usuários. `service_role` só é alcançável com
-- a chave secreta (`sb_secret_...`), que vive apenas no servidor e nunca
-- tem prefixo NEXT_PUBLIC_. Ignorar a RLS é exatamente a função dela.
-- O `anon` continua revogado; esta migração não toca nele.
-- ============================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Vale também para o que for criado daqui pra frente, senão toda tabela
-- nova volta a dar 42501 e o erro reaparece meses depois, longe da causa.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;

-- Reforça a intenção da 0001: o `anon` não enxerga nada do schema public.
-- Idempotente e barato; protege contra uma tabela nova ter nascido com
-- grant para anon vindo de default privilege.
revoke all on all tables in schema public from anon;


-- ------------------------------------------------------------
-- 0045_remove_marca_antiga.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0045 — remove a marca antiga de dentro do banco
--
-- Renomear no código não muda o que já foi gravado no Postgres. Três coisas
-- ficaram para trás e esta migração corrige as duas primeiras; a terceira
-- exige rodar a 0033 de novo (ver nota no fim).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Job do pg_cron
--
-- A 0007 agendou 'lito-aniversarios'. Renomear a string no arquivo não
-- renomeia o job já criado: reaplicar a 0007 apenas criaria um SEGUNDO job
-- com o nome novo, e os dois passariam a enfileirar aniversários — cada
-- contato receberia a automação duas vezes por dia.
-- ------------------------------------------------------------
select cron.unschedule('lito-aniversarios')
where exists (select 1 from cron.job where jobname = 'lito-aniversarios');

select cron.unschedule('crm-aniversarios')
where exists (select 1 from cron.job where jobname = 'crm-aniversarios');

select cron.schedule('crm-aniversarios', '0 12 * * *', $$select private.enqueue_birthdays()$$);

-- Os jobs de tick/sync nunca chegaram a ser criados aqui (as migrações de cron
-- ficaram de fora do setup), mas o unschedule é barato e torna esta migração
-- segura em um banco que já os tenha.
select cron.unschedule('lito-automation-tick')
where exists (select 1 from cron.job where jobname = 'lito-automation-tick');
select cron.unschedule('lito-marketing-tick')
where exists (select 1 from cron.job where jobname = 'lito-marketing-tick');
select cron.unschedule('lito-guru-sync')
where exists (select 1 from cron.job where jobname = 'lito-guru-sync');

-- ------------------------------------------------------------
-- 2. Remetente padrão das campanhas
--
-- A 0010 criou email_campaigns.from_email com DEFAULT apontando para um
-- domínio de terceiro. Toda campanha nova nascia assinando aquele domínio;
-- o Resend recusaria (domínio não verificado nesta conta) e o erro apareceria
-- só na hora do disparo. Quem manda é a env EMAIL_FROM.
-- ------------------------------------------------------------
alter table public.email_campaigns
  alter column from_email set default '';

-- Limpa o que já nasceu com o default antigo. Rascunhos apenas: campanha já
-- enviada fica como está, para o histórico não mentir sobre o que saiu.
update public.email_campaigns
   set from_email = ''
 where from_email like '%litoaviation.com%'
   and status in ('draft', 'rascunho', 'paused');

-- ------------------------------------------------------------
-- 3. NOTA — mojibake na descrição dos departamentos
--
-- O gerador de supabase/setup/ lia os arquivos como ANSI e gravava UTF-8,
-- então os acentos das partes 02–04 chegaram corrompidos ao banco. O caso com
-- dado real é a descrição do departamento Comercial, na 0033, que vive dentro
-- do corpo de uma função e só apareceria ao criar a primeira empresa.
--
-- O gerador já foi corrigido. Para consertar o que está gravado, rode de novo:
--
--   supabase/migrations/0033_departamentos.sql
--
-- Ela é idempotente e redefine a função com o texto certo. Não dá para fazer
-- isso aqui sem duplicar o corpo inteiro da função.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- 0046_location_limits.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0046 — Limites por empresa (camada de plataforma)
--
-- Tabela SEPARADA de public.locations de propósito. A locations tem
-- "admin edita location" (0001) com using/with check private.is_admin(id),
-- então qualquer coluna de limite guardada lá seria escrevível pelo admin
-- do próprio cliente via API — sem precisar de botão na tela.
--
-- Aqui: membro LÊ (a UI precisa explicar o bloqueio), ninguém com papel
-- authenticated ESCREVE. Só a service_role, ou seja, o dono da plataforma
-- pelo SQL Editor.
-- ============================================================

create table if not exists public.location_limits (
  location_id           uuid primary key references public.locations (id) on delete cascade,
  max_users             int,
  max_whatsapp_channels int,
  disabled_modules      text[] not null default '{}',
  notes                 text,
  updated_at            timestamptz not null default now()
);

alter table public.location_limits enable row level security;

revoke all on public.location_limits from anon;

-- Só SELECT. A ausência de policy de insert/update/delete é a proteção:
-- RLS é deny-by-default, então authenticated não escreve de jeito nenhum.
drop policy if exists "membros leem os limites da sua empresa" on public.location_limits;
create policy "membros leem os limites da sua empresa" on public.location_limits
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ------------------------------------------------------------
-- Semente da empresa nova
--
-- disabled_modules é lista de BLOQUEIO, não de liberação: módulo novo do
-- produto nasce disponível para todo mundo. Com lista de liberação, todo
-- módulo novo ficaria invisível para as empresas existentes.
--
-- Os quatro bloqueados consomem credenciais GLOBAIS (OPENAI_API_KEY,
-- RESEND_API_KEY, WHATSAPP_TOKEN): o consumo de qualquer cliente cai na
-- conta do dono da plataforma. Nascem desligados; o dono liga quando o
-- cliente vira pagante.
-- ------------------------------------------------------------
create or replace function private.seed_location_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_limits (location_id, disabled_modules)
  values (new.id, '{ai-studio,agentes-ia,marketing,whatsapp}')
  on conflict (location_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_location_limits() from public, anon, authenticated;

-- Trigger próprio em vez de editar private.on_location_created (0033):
-- mesmo padrão aditivo que a 0033 usou para não reescrever handle_new_user.
drop trigger if exists seed_limits_on_location on public.locations;
create trigger seed_limits_on_location
  after insert on public.locations
  for each row execute function private.seed_location_limits();

-- Retrocompatibilidade: empresas que já existiam antes desta migração ganham
-- a linha de limites SEM nenhum módulo bloqueado.
--
-- Só empresa NOVA (trigger acima) nasce com os quatro módulos desligados.
-- Empresa existente é o dono da plataforma ou cliente já em operação: aplicar
-- o bloqueio retroativamente derrubaria IA, Marketing e WhatsApp de quem já
-- usa, sem aviso. Quem precisar limitar um cliente antigo faz o update à mão.
insert into public.location_limits (location_id, disabled_modules)
select id, '{}'
  from public.locations
on conflict (location_id) do nothing;

grant select on public.location_limits to authenticated;
grant all privileges on public.location_limits to service_role;


-- ------------------------------------------------------------
-- 0047_limite_usuarios.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0047 — Limite de usuários por empresa
--
-- Barra nos DOIS pontos, de propósito:
--   * location_members — a entrada de fato
--   * invitations      — senão o admin cria convites à vontade e a falha
--                        aparece para o CONVIDADO, no meio do cadastro dele
--
-- A contagem soma membros + convites PENDENTES. Ignorar os pendentes
-- deixaria estourar o limite disparando vários convites antes de qualquer
-- um ser aceito.
--
-- No banco e não na tela: o admin do cliente tem sessão válida e chama a
-- API direto. Mesma lição da 0040 (esconder o botão nao impedia o delete).
-- ============================================================

create or replace function private.enforce_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
  loc   uuid := new.location_id;
  mail  text;
begin
  select max_users into lim from public.location_limits where location_id = loc;

  -- null = ilimitado. Zero é diferente de null e bloqueia.
  if lim is null then
    return new;
  end if;

  -- Promessa já feita: se a pessoa que está entrando tem convite PENDENTE nesta
  -- empresa, o slot dela foi reservado quando o convite foi criado -- e naquele
  -- momento o trigger de invitations validou o limite. Entrar tem que funcionar
  -- mesmo que o dono da plataforma tenha REDUZIDO max_users depois.
  --
  -- Sem isto, o convidado se cadastra, o trigger levanta exceção dentro de
  -- private.handle_new_user (que roda na transação de signup), o usuário do Auth
  -- é desfeito junto e a pessoa vê um erro cru do GoTrue. NÃO "simplifique"
  -- removendo este bloco.
  --
  -- Ler auth.users aqui é seguro: a função é security definer e só usa o e-mail
  -- do próprio usuário que está sendo inserido.
  if TG_TABLE_NAME = 'location_members' then
    select u.email into mail from auth.users u where u.id = new.user_id;
    if mail is not null and exists (
      select 1 from public.invitations i
       where i.location_id = loc
         and i.status = 'pending'
         and lower(i.email) = lower(mail)
    ) then
      return new;
    end if;
  end if;

  -- A contagem diferencia por tabela de origem via TG_TABLE_NAME:
  -- * location_members: conta SOMENTE os membros. O convite pendente correspondente
  --   ainda nao foi marcado 'accepted', entao nao contar junto evita double-counting
  --   quando alguem usa um convite para se registrar.
  -- * invitations: conta membros + convites pendentes. Impede criar multiplos
  --   convites de uma vez ultrapassando o limite.
  if TG_TABLE_NAME = 'location_members' then
    select count(*) from public.location_members where location_id = loc
      into atual;
  else
    select (select count(*) from public.location_members where location_id = loc)
         + (select count(*) from public.invitations
             where location_id = loc and status = 'pending')
      into atual;
  end if;

  if atual >= lim then
    raise exception 'LIMITE_USUARIOS: esta empresa atingiu o limite de % usuarios (membros + convites pendentes)', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_user_limit() from public, anon, authenticated;

drop trigger if exists enforce_user_limit_members on public.location_members;
create trigger enforce_user_limit_members
  before insert on public.location_members
  for each row execute function private.enforce_user_limit();

drop trigger if exists enforce_user_limit_invites on public.invitations;
create trigger enforce_user_limit_invites
  before insert on public.invitations
  for each row execute function private.enforce_user_limit();


-- ------------------------------------------------------------
-- 0048_limite_canais.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0048 — Limite de canais de WhatsApp por empresa
--
-- O insert vem direto do client Supabase (db/whatsapp.ts), então o erro
-- do trigger sobe para a UI sozinho, sem rota intermediária.
-- ============================================================

create or replace function private.enforce_channel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
begin
  select max_whatsapp_channels into lim
    from public.location_limits where location_id = new.location_id;

  if lim is null then
    return new;
  end if;

  select count(*) into atual
    from public.whatsapp_channels where location_id = new.location_id;

  if atual >= lim then
    raise exception 'LIMITE_CANAIS: esta empresa atingiu o limite de % numeros de WhatsApp', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_channel_limit() from public, anon, authenticated;

drop trigger if exists enforce_channel_limit_ins on public.whatsapp_channels;
create trigger enforce_channel_limit_ins
  before insert on public.whatsapp_channels
  for each row execute function private.enforce_channel_limit();


-- ------------------------------------------------------------
-- 0049_campanha_motivo_pausa.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0049 — Motivo visível quando o motor pausa uma campanha sozinho
--
-- O motor (src/lib/marketing/engine.ts) passou a recusar campanha de empresa
-- com o módulo `marketing` bloqueado no plano. Sem um lugar para gravar o
-- motivo, a campanha simplesmente parava em 'paused' e o admin do cliente não
-- tinha como saber por quê (a tela mostra só o status).
--
-- Coluna livre, preenchida pelo motor (service role) e limpa quando alguém
-- retoma a campanha pela tela.
-- ============================================================

alter table public.email_campaigns
  add column if not exists pause_reason text;

comment on column public.email_campaigns.pause_reason is
  'Motivo legível da última pausa automática (ex.: módulo bloqueado no plano). Null quando a campanha está rodando normalmente.';


-- ------------------------------------------------------------
-- 0050_plataforma.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0050 — Painel de plataforma: identidade do dono e visão
--
-- A identidade fica no schema `private`, que o PostgREST NÃO expõe: nenhum
-- cliente lê, escreve ou descobre que a tabela existe.
--
-- Não pode ser coluna em public.profiles: a 0001 cria a policy "editar o
-- próprio perfil", então qualquer coluna ali é escrevível pelo dono da linha
-- e um usuário se promoveria a dono da plataforma sozinho. É a mesma razão
-- que fez location_limits virar tabela separada em vez de coluna em locations.
-- ============================================================

create table if not exists private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from private.platform_admins where user_id = (select auth.uid())
  )
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- Wrapper em public: o PostgREST só expõe RPC do schema `public`, e tanto a
-- guarda das rotas quanto o layout de /plataforma precisam consultar isto.
create or replace function public.is_platform_admin_check()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_platform_admin() $$;

revoke all on function public.is_platform_admin_check() from public, anon;
grant execute on function public.is_platform_admin_check() to authenticated;

-- ------------------------------------------------------------
-- O que o dono enxerga: SÓ o cadastro das empresas.
--
-- Nenhuma policy nova em contacts, conversations, messages ou opportunities.
-- A garantia de que o dono não lê dado de cliente é do banco, não da tela.
-- ------------------------------------------------------------
drop policy if exists "plataforma le locations" on public.locations;
create policy "plataforma le locations" on public.locations
  for select to authenticated using (private.is_platform_admin());

drop policy if exists "plataforma cria locations" on public.locations;
create policy "plataforma cria locations" on public.locations
  for insert to authenticated with check (private.is_platform_admin());

drop policy if exists "plataforma edita locations" on public.locations;
create policy "plataforma edita locations" on public.locations
  for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists "plataforma le limites" on public.location_limits;
create policy "plataforma le limites" on public.location_limits
  for select to authenticated using (private.is_platform_admin());

drop policy if exists "plataforma edita limites" on public.location_limits;
create policy "plataforma edita limites" on public.location_limits
  for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- ------------------------------------------------------------
-- Contadores: devolve NÚMEROS, nunca linhas.
--
-- O dono recebe "47 contatos"; nunca ganha select em contacts. A checagem
-- é interna porque a função é security definer — sem ela, qualquer
-- authenticated leria o total de todas as empresas.
-- ------------------------------------------------------------
create or replace function private.platform_stats()
returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'apenas o dono da plataforma pode consultar estes dados'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select l.id,
           (select count(*)::int from public.location_members m where m.location_id = l.id),
           (select count(*)::int from public.contacts c where c.location_id = l.id),
           (select count(*)::int from public.whatsapp_channels w where w.location_id = l.id),
           (select count(*)::int from public.whatsapp_channels w
             where w.location_id = l.id and w.active)
      from public.locations l;
end;
$$;

revoke all on function private.platform_stats() from public, anon;
grant execute on function private.platform_stats() to authenticated;

-- Wrapper em public: o PostgREST só chama RPC do schema exposto.
create or replace function public.platform_stats()
returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)
language sql
security definer
stable
set search_path = ''
as $$ select * from private.platform_stats() $$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to authenticated;


-- ------------------------------------------------------------
-- 0051_suspensao.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0051 — Suspender empresa sem apagar dado
--
-- A suspensão entra DENTRO de private.user_locations(), a função que toda
-- policy do sistema já consulta. Suspender remove a empresa do retorno dela
-- e o efeito propaga para todas as tabelas de uma vez, sem tocar em policy.
--
-- Não há recursão: user_locations() é security definer, então a consulta a
-- locations dentro dela ignora a RLS de locations. É o mesmo motivo pelo
-- qual a 0001 já consulta location_members ali dentro sem recursão.
-- ============================================================

alter table public.locations
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text;

create or replace function private.user_locations()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.location_id
    from public.location_members m
    join public.locations l on l.id = m.location_id
   where m.user_id = (select auth.uid())
     and l.suspended_at is null
$$;

revoke all on function private.user_locations() from public, anon;
grant execute on function private.user_locations() to authenticated;

-- ------------------------------------------------------------
-- Válvula de escape: suspensa, a empresa some de user_locations(), e como a
-- própria policy de locations usa essa função, o cliente deixa de ler até o
-- nome da própria empresa. Sem isto ele veria um CRM vazio e quebrado em vez
-- do motivo — e cada suspensão viraria um chamado de suporte.
--
-- NÃO ACEITA PARÂMETRO. Sendo security definer, uma versão que recebesse
-- location_id deixaria qualquer cliente consultar o estado de qualquer
-- empresa. Resolve a empresa do próprio chamador e devolve só o par
-- (suspended, reason) — nunca nome, nunca id, nunca linha de outra empresa.
-- ------------------------------------------------------------
create or replace function public.my_suspension()
returns table (suspended boolean, reason text)
language sql
security definer
stable
set search_path = ''
as $$
  select (l.suspended_at is not null), l.suspended_reason
    from public.location_members m
    join public.locations l on l.id = m.location_id
   where m.user_id = (select auth.uid())
   -- assume uma empresa por usuário, igual ao resto do código (.maybeSingle()
   -- sobre location_members)
   limit 1
$$;

revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;

-- ------------------------------------------------------------
-- A suspensão mora em locations, que o admin do tenant edita desde a 0001
-- ("admin edita location", usada pelo app para nome, cidade e logo). Sem
-- fechar isso, o admin da empresa suspensa manda um PATCH com
-- suspended_at = null e cancela a própria suspensão — UPDATE não exige
-- SELECT, então nem precisa conseguir ler a linha.
--
-- O `using` impede editar enquanto suspensa; o `with check` impede gravar
-- suspended_at pelo lado do cliente. O dono da plataforma continua podendo,
-- porque passa pela policy própria "plataforma edita locations" (policies
-- permissivas são OR).
-- ------------------------------------------------------------
drop policy if exists "admin edita location" on public.locations;
create policy "admin edita location" on public.locations
  for update to authenticated
  using (private.is_admin(id) and suspended_at is null)
  with check (private.is_admin(id) and suspended_at is null);


-- ------------------------------------------------------------
-- 0052_primeiro_acesso.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0052 — Primeiro acesso e tipo de canal de WhatsApp
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ------------------------------------------------------------
-- A 0001 dá ao usuário a policy "editar o próprio perfil", então sem isto
-- ele marcaria a própria coluna como false e pularia a troca de senha.
-- Neste caso o estrago seria pequeno (pula uma tela), mas o mesmo descuido
-- em outra coluna não seria — a proteção fica no banco.
-- ------------------------------------------------------------
create or replace function private.protect_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_change_password is distinct from old.must_change_password
     and (select auth.uid()) is not null then
    raise exception 'must_change_password so pode ser alterada pelo servidor'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_must_change_password() from public, anon, authenticated;

drop trigger if exists protect_must_change_password on public.profiles;
create trigger protect_must_change_password
  before update on public.profiles
  for each row execute function private.protect_must_change_password();

-- ------------------------------------------------------------
-- Tipo de canal de WhatsApp da empresa.
--
-- Hoje SÓ ARMAZENA: o WhatsApp não oficial ainda não existe no projeto
-- (o módulo inteiro é Meta Cloud API). Gravar desde já significa que as
-- empresas cadastradas antes já estarão marcadas quando ele for construído.
-- ------------------------------------------------------------
alter table public.location_limits
  add column if not exists whatsapp_provider text not null default 'meta';

alter table public.location_limits
  drop constraint if exists location_limits_whatsapp_provider_check;
alter table public.location_limits
  add constraint location_limits_whatsapp_provider_check
  check (whatsapp_provider in ('meta', 'evolution'));


-- ------------------------------------------------------------
-- 0053_criar_empresa.sql
-- ------------------------------------------------------------
-- ============================================================
-- 0053 — Criação de empresa cliente pelo caminho do convite
--
-- Chamada apenas pela rota /api/plataforma/empresas, com service role.
-- NÃO é exposta a `authenticated`: quem pode criar empresa é o dono da
-- plataforma, e a rota já validou isso antes de chamar.
--
-- Por que não insere direto em auth.users + location_members (como a
-- versão anterior desta migração fazia):
--
-- O cadastro está fechado (0006, signup_mode = 'invite_only'). Todo
-- insert em auth.users passa pelo trigger private.handle_new_user,
-- inclusive quando vem da API de admin (auth.admin.createUser) — não só
-- no cadastro público. Sem convite pendente, o trigger levanta
-- 'Cadastro apenas por convite' e desfaz o insert: a rota nunca criaria
-- ninguém.
--
-- E abrir o cadastro seria pior: handle_new_user criaria uma empresa
-- própria pro novo usuário (ramo "cadastro público" da função), e a
-- rota criaria uma segunda em seguida — o cliente nasceria em duas
-- empresas.
--
-- Solução: criar a empresa e o convite ANTES do usuário do Auth existir.
-- Quando a rota chamar auth.admin.createUser, handle_new_user encontra
-- o convite pendente e faz o vínculo sozinho (0006, ramo "Convidado").
-- ============================================================

-- ------------------------------------------------------------
-- private.prepare_client_company
--
-- Cria a empresa e o convite de admin. Não cria o usuário do Auth —
-- isso é responsabilidade da rota, depois desta chamada.
-- ------------------------------------------------------------
create or replace function private.prepare_client_company(
  p_nome             text,
  p_email            text,
  p_criado_por       uuid,
  p_max_users        int,
  p_max_channels     int,
  p_disabled_modules text[],
  p_provider         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc   uuid;
  pipe  uuid;
  email text := lower(trim(p_email));
begin
  -- Validar ANTES de qualquer insert: se falhar depois, sobra empresa
  -- órfã sem convite e sem dono.
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome da empresa e obrigatorio';
  end if;
  if email is null or position('@' in email) = 0 then
    raise exception 'e-mail invalido';
  end if;

  -- Convite pendente de outra empresa para o mesmo e-mail é perigoso:
  -- handle_new_user (0006) busca o convite pendente mais antigo do e-mail
  -- SEM filtrar por empresa. Se deixássemos passar, o trigger vincularia
  -- o novo usuário à empresa antiga (não a esta), a rota não encontraria
  -- o membro aqui, desfaria tudo, e o convite alheio ficaria "accepted"
  -- morto — o convidado de verdade perderia o convite dele.
  if exists (
    select 1 from public.invitations
     where status = 'pending' and lower(email) = email
  ) then
    raise exception 'Já existe um convite pendente para este e-mail em outra empresa';
  end if;

  insert into public.locations (name) values (trim(p_nome)) returning id into loc;

  -- O convite ANTES dos limites é deliberado. O trigger
  -- seed_limits_on_location (0046) já criou a linha de location_limits
  -- aqui, com max_users NULO (= ilimitado). O trigger
  -- enforce_user_limit_invites (0047) roda `before insert` e compara a
  -- contagem ATUAL (sem a linha nova) com max_users — com max_users nulo
  -- neste ponto, qualquer contagem passa, então a ordem não importa para
  -- max_users nulo. O caso que a inversão quebraria é max_users = 0: se os
  -- limites reais fossem gravados antes, o convite do admin (contagem 0
  -- atual >= 0) seria barrado antes de existir qualquer membro.
  insert into public.invitations (location_id, email, role, status, created_by)
  values (loc, email, 'admin', 'pending', p_criado_por);

  update public.location_limits
     set max_users             = p_max_users,
         max_whatsapp_channels = p_max_channels,
         disabled_modules      = coalesce(p_disabled_modules, '{}'),
         whatsapp_provider     = coalesce(nullif(trim(p_provider), ''), 'meta'),
         updated_at            = now()
   where location_id = loc;

  -- Espelha o funil padrão que handle_new_user (0006) cria no ramo de
  -- cadastro público. Este fluxo usa o ramo "convidado" do trigger, que só
  -- vincula o membro e não cria pipeline — sem isto o cliente entraria e o
  -- módulo de Leads não teria nenhum funil.
  insert into public.pipelines (location_id, name, position)
  values (loc, '✅ Controle de Leads', 0)
  returning id into pipe;

  insert into public.stages (location_id, pipeline_id, name, color, position)
  values
    (loc, pipe, 'NOVO LEAD', '#94a3b8', 0),
    (loc, pipe, 'NEGOCIANDO', '#3b82f6', 1),
    (loc, pipe, 'QUENTE 🔥', '#f43f5e', 2),
    (loc, pipe, 'TESTE GRÁTIS', '#f59e0b', 3),
    (loc, pipe, 'FINALIZOU TESTE', '#ec4899', 4),
    (loc, pipe, 'ASSINOU', '#22c55e', 5),
    (loc, pipe, 'FILA DEMO', '#94a3b8', 6),
    (loc, pipe, 'CALL DEMO', '#64748b', 7),
    (loc, pipe, 'PERDIDO', '#ef4444', 8);

  return loc;
end;
$$;

revoke all on function private.prepare_client_company(text, text, uuid, int, int, text[], text)
  from public, anon, authenticated;

-- Wrapper em public porque o PostgREST só expõe RPC do schema `public`.
-- SEM grant a authenticated: só a service role chama, a partir da rota que
-- já validou que quem pediu é o dono da plataforma.
create or replace function public.prepare_client_company(
  p_nome             text,
  p_email            text,
  p_criado_por       uuid,
  p_max_users        int,
  p_max_channels     int,
  p_disabled_modules text[],
  p_provider         text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.prepare_client_company(p_nome, p_email, p_criado_por,
                                         p_max_users, p_max_channels,
                                         p_disabled_modules, p_provider)
$$;

revoke all on function public.prepare_client_company(text, text, uuid, int, int, text[], text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- private.discard_client_company
--
-- Desfaz uma empresa preparada por prepare_client_company quando o
-- cadastro falha depois (ex.: e-mail já existe no Auth, ou o convite
-- não casou). Convite e limites caem junto por cascade (locations tem
-- on delete cascade nas duas tabelas).
--
-- Só apaga se não houver NENHUM membro: se já existe membro, alguém
-- entrou de verdade e isto não é mais lixo de cadastro falho — apagar
-- destruiria a empresa de um cliente real. Fica quieta nesse caso em
-- vez de lançar exceção, porque quem chama já está no meio de um
-- tratamento de erro e não precisa de um segundo.
-- ------------------------------------------------------------
create or replace function private.discard_client_company(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.location_members where location_id = p_location_id
  ) then
    return;
  end if;

  delete from public.locations where id = p_location_id;
end;
$$;

revoke all on function private.discard_client_company(uuid) from public, anon, authenticated;

create or replace function public.discard_client_company(p_location_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.discard_client_company(p_location_id)
$$;

revoke all on function public.discard_client_company(uuid) from public, anon, authenticated;


