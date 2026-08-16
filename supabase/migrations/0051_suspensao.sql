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
   limit 1
$$;

revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;
