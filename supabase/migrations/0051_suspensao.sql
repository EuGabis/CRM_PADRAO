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
