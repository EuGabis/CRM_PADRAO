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
