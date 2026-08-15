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
