-- ============================================================
-- 0053 — Criação atômica de empresa cliente
--
-- Chamada apenas pela rota /api/plataforma/empresas, com service role.
-- NÃO é exposta a `authenticated`: quem pode criar empresa é o dono da
-- plataforma, e a rota já validou isso antes de chamar.
-- ============================================================

create or replace function private.create_client_company(
  p_user_id          uuid,
  p_nome             text,
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
  loc uuid;
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome da empresa e obrigatorio';
  end if;

  insert into public.locations (name) values (trim(p_nome)) returning id into loc;

  -- O trigger seed_limits_on_location (0046) já criou a linha de limites
  -- aqui, com max_users nulo. Por isso o vínculo abaixo nunca é barrado
  -- pelo trigger de limite: os valores reais só entram no update seguinte.
  insert into public.location_members (location_id, user_id, role)
  values (loc, p_user_id, 'admin');

  update public.location_limits
     set max_users             = p_max_users,
         max_whatsapp_channels = p_max_channels,
         disabled_modules      = coalesce(p_disabled_modules, '{}'),
         whatsapp_provider     = coalesce(nullif(trim(p_provider), ''), 'meta'),
         updated_at            = now()
   where location_id = loc;

  update public.profiles set must_change_password = true where id = p_user_id;

  return loc;
end;
$$;

revoke all on function private.create_client_company(uuid, text, int, int, text[], text) from public, anon, authenticated;

-- Wrapper em public porque o PostgREST só expõe RPC do schema `public`.
-- SEM grant a authenticated: só a service role chama, a partir da rota que
-- já validou que quem pediu é o dono da plataforma.
create or replace function public.create_client_company(
  p_user_id          uuid,
  p_nome             text,
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
  select private.create_client_company(p_user_id, p_nome, p_max_users,
                                       p_max_channels, p_disabled_modules, p_provider)
$$;

revoke all on function public.create_client_company(uuid, text, int, int, text[], text)
  from public, anon, authenticated;
