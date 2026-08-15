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
