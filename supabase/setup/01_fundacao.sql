-- ============================================================
-- SETUP 01_fundacao
-- GERADO por scripts/gerar-setup.ps1 -- nao edite a mao.
-- Fonte: supabase/migrations/, em ordem cronologica real.
-- Rode as partes 01 -> 04 EM ORDEM no SQL Editor. Ver README.md.
-- ============================================================

-- ------------------------------------------------------------
-- 0001_initial_schema.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Schema inicial (multi-tenant, segurança máxima)
-- Espelha src/lib/data/types.ts
--
-- Princípios:
--  * RLS habilitada em TODAS as tabelas (deny-by-default)
--  * Nenhum acesso para anon (CRM exige login) — revoke explícito
--  * Todas as políticas: TO authenticated + checagem de tenant
--  * UPDATE sempre com USING + WITH CHECK (evita troca de tenant)
--  * Helpers SECURITY DEFINER isolados no schema "private" (não exposto
--    pela API), com search_path fixo
-- ============================================================

-- Permite definir funções que referenciam tabelas criadas mais adiante
-- no mesmo script (a validação acontece na execução, não na criação):
set check_function_bodies = off;

-- ---------- Schema privado para helpers ----------
create schema if not exists private;
grant usage on schema private to authenticated;

-- Locations (subcontas/tenants) do usuário logado.
-- SECURITY DEFINER para evitar recursão de RLS em location_members.
create or replace function private.user_locations()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select location_id
  from public.location_members
  where user_id = (select auth.uid())
$$;

create or replace function private.is_admin(loc uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.location_members
    where location_id = loc
      and user_id = (select auth.uid())
      and role = 'admin'
  )
$$;

revoke all on function private.user_locations() from public, anon;
revoke all on function private.is_admin(uuid) from public, anon;
grant execute on function private.user_locations() to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

-- updated_at automático
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Tabelas ----------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table public.location_members (
  location_id uuid not null references public.locations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  only_assigned boolean not null default false, -- "ver apenas dados atribuídos"
  created_at timestamptz not null default now(),
  primary key (location_id, user_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  company text,
  tags text[] not null default '{}',
  owner_id uuid references auth.users (id) on delete set null,
  dnd boolean not null default false,
  custom_fields jsonb not null default '{}',
  last_activity_at timestamptz,
  last_activity_channel text check (
    last_activity_channel in ('whatsapp', 'instagram', 'facebook', 'sms', 'email')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  name text not null,
  source text not null default 'Manual',
  value numeric(12, 2) not null default 0,
  owner_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'instagram', 'facebook', 'sms', 'email')),
  unread_count int not null default 0,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  starred boolean not null default false,
  sla_days int not null default 0,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  type text not null default 'text' check (type in ('text', 'audio', 'event')),
  channel text not null check (channel in ('whatsapp', 'instagram', 'facebook', 'sms', 'email')),
  body text not null default '',
  internal boolean not null default false,
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  folder text,
  status text not null default 'draft' check (status in ('published', 'draft')),
  enrolled_total int not null default 0,
  enrolled_active int not null default 0,
  trigger jsonb,
  actions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  calendar text not null default 'Reuniões',
  source text not null default 'crm' check (source in ('google', 'crm')),
  created_at timestamptz not null default now()
);

-- ---------- Índices ----------
create index contacts_location_idx on public.contacts (location_id);
create index contacts_owner_idx on public.contacts (owner_id);
create index pipelines_location_idx on public.pipelines (location_id);
create index stages_location_idx on public.stages (location_id);
create index stages_pipeline_idx on public.stages (pipeline_id);
create index opportunities_location_idx on public.opportunities (location_id);
create index opportunities_stage_idx on public.opportunities (stage_id);
create index opportunities_contact_idx on public.opportunities (contact_id);
create index conversations_location_idx on public.conversations (location_id);
create index conversations_contact_idx on public.conversations (contact_id);
create index messages_location_idx on public.messages (location_id);
create index messages_conversation_idx on public.messages (conversation_id);
create index workflows_location_idx on public.workflows (location_id);
create index appointments_location_idx on public.appointments (location_id);
create index location_members_user_idx on public.location_members (user_id);

-- ---------- updated_at ----------
create trigger contacts_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function private.set_updated_at();
create trigger workflows_updated_at before update on public.workflows
  for each row execute function private.set_updated_at();

-- ---------- RLS: habilitar em tudo + cortar anon ----------
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.location_members enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.workflows enable row level security;
alter table public.appointments enable row level security;

-- CRM não tem acesso anônimo a nada:
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------- Políticas ----------

-- locations: membro vê; só admin edita; criação/exclusão via fluxo controlado
create policy "membros veem sua location" on public.locations
  for select to authenticated
  using (id in (select private.user_locations()));

create policy "admin edita location" on public.locations
  for update to authenticated
  using (private.is_admin(id))
  with check (private.is_admin(id));

-- profiles: o próprio + colegas de location; só o próprio edita
create policy "ver perfis da equipe" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.location_members lm
      where lm.user_id = public.profiles.id
        and lm.location_id in (select private.user_locations())
    )
  );

create policy "editar o próprio perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- location_members: membros veem a equipe; só admin gerencia
create policy "ver equipe da location" on public.location_members
  for select to authenticated
  using (location_id in (select private.user_locations()));

create policy "admin adiciona membros" on public.location_members
  for insert to authenticated
  with check (private.is_admin(location_id));

create policy "admin edita membros" on public.location_members
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

create policy "admin remove membros" on public.location_members
  for delete to authenticated
  using (private.is_admin(location_id));

-- Tabelas de domínio: CRUD completo para membros da location.
-- (Refinamento "apenas dados atribuídos" entra numa fase futura.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts', 'pipelines', 'stages', 'opportunities',
    'conversations', 'messages', 'workflows', 'appointments'
  ]
  loop
    execute format($p$
      create policy "membros leem" on public.%I
        for select to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros criam" on public.%I
        for insert to authenticated
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros editam" on public.%I
        for update to authenticated
        using (location_id in (select private.user_locations()))
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros excluem" on public.%I
        for delete to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
  end loop;
end;
$$;

-- ---------- Onboarding: novo usuário => perfil + location + pipeline padrão ----------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc uuid;
  pipe uuid;
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );

  insert into public.locations (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'company', ''), 'Minha empresa'))
  returning id into loc;

  insert into public.location_members (location_id, user_id, role)
  values (loc, new.id, 'admin');

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

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- ------------------------------------------------------------
-- 0002_contacts_module.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Módulo Contatos completo
-- smart_lists, tasks, contact_fields, bulk_logs
-- Mesmo padrão de segurança da 0001: RLS deny-by-default,
-- políticas TO authenticated com checagem de tenant, sem anon.
-- ============================================================

create table public.smart_lists (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  conditions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  assignee_id uuid references auth.users (id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create table public.contact_fields (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  type text not null default 'text' check (type in ('text', 'dropdown', 'date', 'number')),
  options text[] not null default '{}',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.bulk_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  operation text not null,
  affected int not null default 0,
  status text not null default 'done' check (status in ('done', 'processing')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index smart_lists_location_idx on public.smart_lists (location_id);
create index tasks_location_idx on public.tasks (location_id);
create index tasks_contact_idx on public.tasks (contact_id);
create index contact_fields_location_idx on public.contact_fields (location_id);
create index bulk_logs_location_idx on public.bulk_logs (location_id);

alter table public.smart_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.contact_fields enable row level security;
alter table public.bulk_logs enable row level security;

revoke all on public.smart_lists, public.tasks, public.contact_fields, public.bulk_logs from anon;

do $$
declare
  t text;
begin
  foreach t in array array['smart_lists', 'tasks', 'contact_fields', 'bulk_logs']
  loop
    execute format($p$
      create policy "membros leem" on public.%I
        for select to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros criam" on public.%I
        for insert to authenticated
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros editam" on public.%I
        for update to authenticated
        using (location_id in (select private.user_locations()))
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros excluem" on public.%I
        for delete to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 0003_conversas_realtime.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Conversas: trechos (snippets) + Realtime
-- ============================================================

-- Trechos (respostas rápidas usadas no composer)
create table public.snippets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index snippets_location_idx on public.snippets (location_id);

alter table public.snippets enable row level security;
revoke all on public.snippets from anon;

create policy "membros leem" on public.snippets
  for select to authenticated
  using (location_id in (select private.user_locations()));
create policy "membros criam" on public.snippets
  for insert to authenticated
  with check (location_id in (select private.user_locations()));
create policy "membros editam" on public.snippets
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));
create policy "membros excluem" on public.snippets
  for delete to authenticated
  using (location_id in (select private.user_locations()));

-- Realtime: transmite INSERTs/UPDATEs dessas tabelas aos clientes conectados.
-- A RLS continua valendo: cada usuário só recebe eventos das linhas que pode ler.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;


-- ------------------------------------------------------------
-- 0004_equipe_permissoes.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Equipe, convites e permissões
--
-- Compatível com o que já existe: membros atuais continuam com
-- acesso total (permissions '{}' = tudo liberado, only_assigned = false).
-- ============================================================

set check_function_bodies = off;

-- ---------- 1. Permissões por membro ----------
-- '{}' significa "sem restrição" (todos os módulos liberados).
-- Chaves são os slugs dos módulos: {"pagamentos": false, "relatorios": false}
alter table public.location_members
  add column if not exists permissions jsonb not null default '{}';

-- ---------- 2. Convites ----------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  only_assigned boolean not null default false,
  permissions jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists invitations_location_idx on public.invitations (location_id);
-- Um convite pendente por e-mail/empresa
create unique index if not exists invitations_pending_unique
  on public.invitations (location_id, lower(email))
  where status = 'pending';

alter table public.invitations enable row level security;
revoke all on public.invitations from anon;

drop policy if exists "admins leem convites" on public.invitations;
create policy "admins leem convites" on public.invitations
  for select to authenticated
  using (private.is_admin(location_id));

drop policy if exists "admins criam convites" on public.invitations;
create policy "admins criam convites" on public.invitations
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins editam convites" on public.invitations;
create policy "admins editam convites" on public.invitations
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem convites" on public.invitations;
create policy "admins excluem convites" on public.invitations
  for delete to authenticated
  using (private.is_admin(location_id));

-- ---------- 3. Helper: o usuário vê todos os dados da empresa? ----------
create or replace function private.sees_all(loc uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.location_members
    where location_id = loc
      and user_id = (select auth.uid())
      and only_assigned = false
  )
$$;

revoke all on function private.sees_all(uuid) from public, anon;
grant execute on function private.sees_all(uuid) to authenticated;

-- ---------- 4. "Ver apenas dados atribuídos" nas políticas ----------
-- Só restringe quem tiver only_assigned = true (ninguém, por padrão).
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'opportunities']
  loop
    execute format('drop policy if exists "membros leem" on public.%I;', t);
    execute format($p$
      create policy "membros leem" on public.%I
        for select to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        );
    $p$, t);

    execute format('drop policy if exists "membros editam" on public.%I;', t);
    execute format($p$
      create policy "membros editam" on public.%I
        for update to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        )
        with check (location_id in (select private.user_locations()));
    $p$, t);

    execute format('drop policy if exists "membros excluem" on public.%I;', t);
    execute format($p$
      create policy "membros excluem" on public.%I
        for delete to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        );
    $p$, t);
  end loop;
end;
$$;

-- ---------- 5. Proteção: a empresa nunca fica sem administrador ----------
create or replace function private.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admins int;
begin
  if TG_OP = 'DELETE' then
    if OLD.role <> 'admin' then return OLD; end if;
  else
    if OLD.role <> 'admin' or NEW.role = 'admin' then return NEW; end if;
  end if;

  select count(*) into admins
  from public.location_members
  where location_id = OLD.location_id and role = 'admin';

  if admins <= 1 then
    raise exception 'A empresa precisa de pelo menos um administrador';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists protect_last_admin_update on public.location_members;
create trigger protect_last_admin_update
  before update on public.location_members
  for each row execute function private.protect_last_admin();

drop trigger if exists protect_last_admin_delete on public.location_members;
create trigger protect_last_admin_delete
  before delete on public.location_members
  for each row execute function private.protect_last_admin();

-- ---------- 6. Onboarding: aceitar convite pendente ----------
-- Quem foi convidado entra na empresa que convidou (com o papel definido).
-- Quem não tem convite cria a própria empresa (comportamento original).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  loc uuid;
  pipe uuid;
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );

  select * into invite
  from public.invitations
  where status = 'pending' and lower(email) = lower(new.email)
  order by created_at
  limit 1;

  if found then
    insert into public.location_members (location_id, user_id, role, only_assigned, permissions)
    values (invite.location_id, new.id, invite.role, invite.only_assigned, invite.permissions)
    on conflict (location_id, user_id) do nothing;

    update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

    return new;
  end if;

  insert into public.locations (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'company', ''), 'Minha empresa'))
  returning id into loc;

  insert into public.location_members (location_id, user_id, role)
  values (loc, new.id, 'admin');

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

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 0005_activation_checklist.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Checklist de ativação persistente (por empresa)
-- Guarda quem concluiu cada passo e quando.
-- ============================================================

create table if not exists public.activation_steps (
  location_id uuid not null references public.locations (id) on delete cascade,
  step_key text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references auth.users (id) on delete set null,
  primary key (location_id, step_key)
);

alter table public.activation_steps enable row level security;
revoke all on public.activation_steps from anon;

drop policy if exists "membros leem" on public.activation_steps;
create policy "membros leem" on public.activation_steps
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam" on public.activation_steps;
create policy "membros criam" on public.activation_steps
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.activation_steps;
create policy "membros excluem" on public.activation_steps
  for delete to authenticated
  using (location_id in (select private.user_locations()));


-- ------------------------------------------------------------
-- 0006_cadastro_por_convite.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Cadastro apenas por convite
--
-- O bloqueio acontece no trigger de criação de usuário: sem convite
-- pendente, a transação é abortada e a conta NÃO é criada — vale
-- inclusive para quem chamar a API de auth diretamente.
--
-- Para reabrir o cadastro público no futuro:
--   update private.app_settings set signup_mode = 'open';
-- Para fechar de novo:
--   update private.app_settings set signup_mode = 'invite_only';
-- ============================================================

set check_function_bodies = off;

-- Configuração global (schema privado — não exposto pela API)
create table if not exists private.app_settings (
  id boolean primary key default true check (id),
  signup_mode text not null default 'invite_only'
    check (signup_mode in ('invite_only', 'open')),
  updated_at timestamptz not null default now()
);

insert into private.app_settings (id) values (true) on conflict (id) do nothing;

-- Garante o modo fechado ao aplicar esta migração
update private.app_settings set signup_mode = 'invite_only', updated_at = now();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  mode text;
  loc uuid;
  pipe uuid;
begin
  select * into invite
  from public.invitations
  where status = 'pending' and lower(email) = lower(new.email)
  order by created_at
  limit 1;

  -- Sem convite: só continua se o cadastro público estiver liberado
  if not found then
    select signup_mode into mode from private.app_settings where id;
    if coalesce(mode, 'invite_only') = 'invite_only' then
      raise exception 'Cadastro apenas por convite'
        using errcode = '42501',
              hint = 'Peça um convite ao administrador da empresa.';
    end if;
  end if;

  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );

  -- Convidado: entra na empresa que convidou
  if invite.id is not null then
    insert into public.location_members (location_id, user_id, role, only_assigned, permissions)
    values (invite.location_id, new.id, invite.role, invite.only_assigned, invite.permissions)
    on conflict (location_id, user_id) do nothing;

    update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

    return new;
  end if;

  -- Cadastro público (quando liberado): cria a própria empresa
  insert into public.locations (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'company', ''), 'Minha empresa'))
  returning id into loc;

  insert into public.location_members (location_id, user_id, role)
  values (loc, new.id, 'admin');

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

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 0007_automations.sql
-- ------------------------------------------------------------
-- ============================================================
-- CRM ON — Motor de automações (schema + captura de eventos)
-- Migração única: rode este arquivo inteiro de uma vez no SQL Editor.
-- ============================================================
set check_function_bodies = off;

-- ---------- Configuração dos workflows ----------
alter table public.workflows
  add column if not exists trigger_key text,
  add column if not exists trigger_config jsonb not null default '{}',
  add column if not exists steps jsonb not null default '[]';

-- ---------- Fila de execuções ----------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'waiting', 'done', 'failed', 'cancelled')),
  current_step int not null default 0,
  next_run_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  attempts int not null default 0,
  last_error text,
  event_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- idempotência: o mesmo evento não gera dois runs
create unique index if not exists automation_runs_event_key_uniq
  on public.automation_runs (event_key) where event_key is not null;
create index if not exists automation_runs_due_idx
  on public.automation_runs (status, next_run_at);
create index if not exists automation_runs_location_idx
  on public.automation_runs (location_id, created_at desc);
create index if not exists automation_runs_workflow_idx
  on public.automation_runs (workflow_id, created_at desc);

-- ---------- Log passo a passo ----------
create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  run_id uuid not null references public.automation_runs (id) on delete cascade,
  step_index int not null,
  action_key text not null,
  status text not null check (status in ('ok', 'skipped', 'error')),
  message text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists automation_logs_run_idx
  on public.automation_logs (run_id, step_index);

-- ---------- RLS ----------
alter table public.automation_runs enable row level security;
alter table public.automation_logs enable row level security;
revoke all on public.automation_runs, public.automation_logs from anon;

drop policy if exists "membros leem" on public.automation_runs;
create policy "membros leem" on public.automation_runs
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.automation_runs;
create policy "membros excluem" on public.automation_runs
  for delete to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros leem" on public.automation_logs;
create policy "membros leem" on public.automation_logs
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ---------- Enfileiramento (usado por todos os triggers) ----------
-- Cria um run por workflow publicado que escute o gatilho.
-- Protege contra loop: mesmo workflow + contato nos últimos 5 minutos é ignorado.
create or replace function private.enqueue_automation(
  p_trigger_key text,
  p_location_id uuid,
  p_contact_id uuid,
  p_opportunity_id uuid,
  p_payload jsonb,
  p_event_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wf record;
begin
  if p_location_id is null then
    return;
  end if;

  for wf in
    select id from public.workflows
    where location_id = p_location_id
      and status = 'published'
      and trigger_key = p_trigger_key
  loop
    if exists (
      select 1 from public.automation_runs r
      where r.workflow_id = wf.id
        and r.contact_id is not distinct from p_contact_id
        and r.created_at > now() - interval '5 minutes'
    ) then
      continue;
    end if;

    insert into public.automation_runs
      (location_id, workflow_id, contact_id, opportunity_id, payload, event_key)
    values
      (p_location_id, wf.id, p_contact_id, p_opportunity_id, coalesce(p_payload, '{}'::jsonb),
       p_event_key || ':' || wf.id::text)
    on conflict (event_key) do nothing;
  end loop;
end;
$$;

revoke all on function private.enqueue_automation(text, uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;


-- ============================================================
-- PARTE 2 — Triggers que alimentam a fila
-- ============================================================


-- ---------- Contatos ----------
create or replace function private.on_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added_tags text[];
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation(
      'contato-criado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id),
      'contato-criado:' || new.id::text
    );
    return new;
  end if;

  -- tags que passaram a existir nesta atualização
  select array(
    select unnest(coalesce(new.tags, '{}'))
    except
    select unnest(coalesce(old.tags, '{}'))
  ) into added_tags;

  if coalesce(array_length(added_tags, 1), 0) > 0 then
    perform private.enqueue_automation(
      'tag-adicionada', new.location_id, new.id, null,
      jsonb_build_object('tags', to_jsonb(added_tags)),
      'tag:' || new.id::text || ':' || array_to_string(added_tags, ',')
        || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  if new.custom_fields is distinct from old.custom_fields
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.company is distinct from old.company then
    perform private.enqueue_automation(
      'contato-atualizado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id),
      'contato-upd:' || new.id::text || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_automation on public.contacts;
create trigger contacts_automation
  after insert or update on public.contacts
  for each row execute function private.on_contact_change();

-- ---------- Oportunidades ----------
create or replace function private.on_opportunity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation(
      'oportunidade-criada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('stage_id', new.stage_id, 'pipeline_id', new.pipeline_id,
                         'value', new.value),
      'op-criada:' || new.id::text
    );
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    perform private.enqueue_automation(
      'fase-alterada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id,
                         'pipeline_id', new.pipeline_id),
      'fase:' || new.id::text || ':' || new.stage_id::text
        || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform private.enqueue_automation(
        'oportunidade-ganha', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value),
        'op-ganha:' || new.id::text
      );
    elsif new.status = 'lost' then
      perform private.enqueue_automation(
        'oportunidade-perdida', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value),
        'op-perdida:' || new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunities_automation on public.opportunities;
create trigger opportunities_automation
  after insert or update on public.opportunities
  for each row execute function private.on_opportunity_change();

-- ---------- Mensagem recebida ----------
create or replace function private.on_message_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c uuid;
begin
  if new.direction <> 'in' then
    return new;
  end if;

  select contact_id into c from public.conversations where id = new.conversation_id;

  perform private.enqueue_automation(
    'cliente-respondeu', new.location_id, c, null,
    jsonb_build_object('channel', new.channel, 'body', new.body),
    'resp:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists messages_automation on public.messages;
create trigger messages_automation
  after insert on public.messages
  for each row execute function private.on_message_in();

-- ---------- Compromisso agendado ----------
create or replace function private.on_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_automation(
    'compromisso-agendado', new.location_id, new.contact_id, null,
    jsonb_build_object('starts_at', new.starts_at, 'title', new.title),
    'compromisso:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists appointments_automation on public.appointments;
create trigger appointments_automation
  after insert on public.appointments
  for each row execute function private.on_appointment_created();

-- ---------- Aniversários (verificação diária) ----------
create or replace function private.enqueue_birthdays()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  bday date;
begin
  for c in
    select id, location_id, custom_fields ->> 'Data de aniversário' as raw
    from public.contacts
    where custom_fields ? 'Data de aniversário'
      and coalesce(custom_fields ->> 'Data de aniversário', '') <> ''
  loop
    begin
      bday := c.raw::date;
    exception when others then
      continue; -- data inválida no campo personalizado: ignora este contato
    end;

    if to_char(bday, 'MM-DD') = to_char(now(), 'MM-DD') then
      perform private.enqueue_automation(
        'aniversario', c.location_id, c.id, null, '{}'::jsonb,
        'aniversario:' || c.id::text || ':' || to_char(now(), 'YYYY')
      );
    end if;
  end loop;
end;
$$;

-- 12:00 UTC = 09:00 no horário de Brasília
select cron.unschedule('crm-aniversarios')
where exists (select 1 from cron.job where jobname = 'crm-aniversarios');

select cron.schedule('crm-aniversarios', '0 12 * * *', $$select private.enqueue_birthdays()$$);


