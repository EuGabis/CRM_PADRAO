-- ============================================================
-- 0053 — Criação de empresa cliente pelo caminho do convite
--
-- Chamada apenas pela rota /api/plataforma/empresas, com service role.
-- NÃO é exposta a `authenticated`: quem pode criar empresa é o dono da
-- plataforma, e a rota já validou isso antes de chamar.
--
-- Por que não insere direto em auth.users + location_members (como a
-- versão anterior desta migração fazia):
--
-- O cadastro está fechado (0006, signup_mode = 'invite_only'). Todo
-- insert em auth.users passa pelo trigger private.handle_new_user,
-- inclusive quando vem da API de admin (auth.admin.createUser) — não só
-- no cadastro público. Sem convite pendente, o trigger levanta
-- 'Cadastro apenas por convite' e desfaz o insert: a rota nunca criaria
-- ninguém.
--
-- E abrir o cadastro seria pior: handle_new_user criaria uma empresa
-- própria pro novo usuário (ramo "cadastro público" da função), e a
-- rota criaria uma segunda em seguida — o cliente nasceria em duas
-- empresas.
--
-- Solução: criar a empresa e o convite ANTES do usuário do Auth existir.
-- Quando a rota chamar auth.admin.createUser, handle_new_user encontra
-- o convite pendente e faz o vínculo sozinho (0006, ramo "Convidado").
-- ============================================================

-- ------------------------------------------------------------
-- private.prepare_client_company
--
-- Cria a empresa e o convite de admin. Não cria o usuário do Auth —
-- isso é responsabilidade da rota, depois desta chamada.
-- ------------------------------------------------------------
create or replace function private.prepare_client_company(
  p_nome             text,
  p_email            text,
  p_criado_por       uuid,
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
  loc     uuid;
  pipe    uuid;
  v_email text := lower(trim(p_email));
begin
  -- Validar ANTES de qualquer insert: se falhar depois, sobra empresa
  -- órfã sem convite e sem dono.
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome da empresa e obrigatorio';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'e-mail invalido';
  end if;

  -- Convite pendente de outra empresa para o mesmo e-mail é perigoso:
  -- handle_new_user (0006) busca o convite pendente mais antigo do e-mail
  -- SEM filtrar por empresa. Se deixássemos passar, o trigger vincularia
  -- o novo usuário à empresa antiga (não a esta), a rota não encontraria
  -- o membro aqui, desfaria tudo, e o convite alheio ficaria "accepted"
  -- morto — o convidado de verdade perderia o convite dele.
  if exists (
    select 1 from public.invitations i
     where i.status = 'pending' and lower(i.email) = v_email
  ) then
    raise exception 'Já existe um convite pendente para este e-mail em outra empresa. Revogue esse convite ou peça que a pessoa o aceite antes de cadastrar esta empresa.';
  end if;

  insert into public.locations (name) values (trim(p_nome)) returning id into loc;

  -- O convite ANTES dos limites é deliberado. O trigger
  -- seed_limits_on_location (0046) já criou a linha de location_limits
  -- aqui, com max_users NULO (= ilimitado). O trigger
  -- enforce_user_limit_invites (0047) roda `before insert` e compara a
  -- contagem ATUAL (sem a linha nova) com max_users — com max_users nulo
  -- neste ponto, qualquer contagem passa, então a ordem não importa para
  -- max_users nulo. O caso que a inversão quebraria é max_users = 0: se os
  -- limites reais fossem gravados antes, o convite do admin (contagem 0
  -- atual >= 0) seria barrado antes de existir qualquer membro.
  insert into public.invitations (location_id, email, role, status, created_by)
  values (loc, v_email, 'admin', 'pending', p_criado_por);

  update public.location_limits
     set max_users             = p_max_users,
         max_whatsapp_channels = p_max_channels,
         disabled_modules      = coalesce(p_disabled_modules, '{}'),
         whatsapp_provider     = coalesce(nullif(trim(p_provider), ''), 'meta'),
         updated_at            = now()
   where location_id = loc;

  -- Espelha o funil padrão que handle_new_user (0006) cria no ramo de
  -- cadastro público. Este fluxo usa o ramo "convidado" do trigger, que só
  -- vincula o membro e não cria pipeline — sem isto o cliente entraria e o
  -- módulo de Leads não teria nenhum funil.
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

  return loc;
end;
$$;

revoke all on function private.prepare_client_company(text, text, uuid, int, int, text[], text)
  from public, anon, authenticated;

-- Wrapper em public porque o PostgREST só expõe RPC do schema `public`.
-- SEM grant a authenticated: só a service role chama, a partir da rota que
-- já validou que quem pediu é o dono da plataforma.
create or replace function public.prepare_client_company(
  p_nome             text,
  p_email            text,
  p_criado_por       uuid,
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
  select private.prepare_client_company(p_nome, p_email, p_criado_por,
                                         p_max_users, p_max_channels,
                                         p_disabled_modules, p_provider)
$$;

revoke all on function public.prepare_client_company(text, text, uuid, int, int, text[], text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- private.discard_client_company
--
-- Desfaz uma empresa preparada por prepare_client_company quando o
-- cadastro falha depois (ex.: e-mail já existe no Auth, ou o convite
-- não casou). Convite e limites caem junto por cascade (locations tem
-- on delete cascade nas duas tabelas).
--
-- Só apaga se não houver NENHUM membro: se já existe membro, alguém
-- entrou de verdade e isto não é mais lixo de cadastro falho — apagar
-- destruiria a empresa de um cliente real. Fica quieta nesse caso em
-- vez de lançar exceção, porque quem chama já está no meio de um
-- tratamento de erro e não precisa de um segundo.
-- ------------------------------------------------------------
create or replace function private.discard_client_company(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.location_members where location_id = p_location_id
  ) then
    return;
  end if;

  delete from public.locations where id = p_location_id;
end;
$$;

revoke all on function private.discard_client_company(uuid) from public, anon, authenticated;

create or replace function public.discard_client_company(p_location_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.discard_client_company(p_location_id)
$$;

revoke all on function public.discard_client_company(uuid) from public, anon, authenticated;
