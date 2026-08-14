-- ============================================================
-- Lito CRM — Leads: segmentação dos PIPELINES
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
