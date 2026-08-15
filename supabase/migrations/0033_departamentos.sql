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
