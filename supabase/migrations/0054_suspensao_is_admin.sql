-- ============================================================
-- 0054 — Suspensão também dentro de private.is_admin()
--
-- A 0051 colocou o filtro de suspensão em private.user_locations(), mas
-- is_admin() ficou de fora. As duas são helpers irmãos e várias policies usam
-- is_admin(location_id) SOZINHO — sem passar por user_locations(). Resultado:
-- o admin de uma empresa suspensa continuava podendo, por chamada direta ao
-- PostgREST (a tela bloqueia, o curl não):
--
--   invitations         select, insert, update, delete
--   location_members    insert, update, delete
--   payment_credentials select, insert, update, delete
--   departments         insert, update, delete
--   department_channels insert, delete
--
-- O caso concreto: admin suspenso cria convite e o convidado se cadastra —
-- handle_new_user é security definer e ignora RLS. Suspensão que não fecha
-- esse caminho não é suspensão.
--
-- Um lugar só, propaga para as 5 tabelas.
--
-- NÃO tranca o dono da plataforma fora de reativar: ele escreve em locations
-- pela policy "plataforma edita locations" da 0050, que usa
-- private.is_platform_admin() e não toca em is_admin(). Policies permissivas
-- são OR, então reativar continua funcionando com a empresa suspensa.
-- ============================================================

create or replace function private.is_admin(loc uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.location_members m
      join public.locations l on l.id = m.location_id
     where m.location_id = loc
       and m.user_id = (select auth.uid())
       and m.role = 'admin'
       and l.suspended_at is null
  )
$$;

-- Mesmos revoke/grant da 0001: create or replace preserva os privilégios
-- existentes, mas repetimos para a migração ser idempotente sozinha (banco
-- novo instalado pelo setup concatenado depende disso).
revoke all on function private.is_admin(uuid) from public, anon;
grant execute on function private.is_admin(uuid) to authenticated;
