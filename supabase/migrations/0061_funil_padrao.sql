-- ============================================================
-- 0061 — Funil padrão de cinco etapas para empresa nova
--
-- private.prepare_client_company (0053) semeava nove etapas de venda de
-- SaaS (`TESTE GRÁTIS`, `ASSINOU`, `FILA DEMO`, `CALL DEMO`, ...) — esse é
-- o funil do próprio dono da plataforma vendendo o CRM, e não faz sentido
-- para os clientes dele (o primeiro é uma agência de viagem). Esta
-- migração recria a função trocando só o bloco de etapas pelas cinco
-- genéricas: Novo Lead, Proposta Enviada, Em Negociação, Fechado/Ganho,
-- Perdido.
--
-- O corpo da função (validação de entrada, convite, limites) é uma cópia
-- exata da 0053 — mudar qualquer outra parte quebraria o cadastro de
-- empresa, que é o caminho pelo qual o dono da plataforma ganha cliente.
--
-- Empresa que já existe NÃO é tocada por esta migração, de propósito:
-- cada uma pode ter oportunidades nas etapas antigas, e reescrever em
-- massa apagaria trabalho de vendas em silêncio. O ajuste de empresa
-- existente é manual, com trava, em supabase/manual/ajustar-funil-5-etapas.sql
-- — fora do gerar-setup.ps1, porque não é migração de banco novo.
-- ============================================================

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

  -- Cria o mesmo pipeline "✅ Controle de Leads" que handle_new_user (0006)
  -- cria no ramo de cadastro público — sem isto o cliente entraria e o
  -- módulo de Leads não teria nenhum funil. Este fluxo usa o ramo
  -- "convidado" do trigger, que só vincula o membro e não cria pipeline.
  --
  -- ⚠️ DIVERGÊNCIA CONHECIDA: as ETAPAS abaixo NÃO são espelhadas em
  -- handle_new_user. O trigger (0006, ramo de cadastro público) continua
  -- semeando as nove etapas antigas (`NOVO LEAD`, `NEGOCIANDO`,
  -- `TESTE GRÁTIS`, ...) — esta migração não foi replicada lá. Empresa
  -- criada pelo cadastro público nasce com o funil errado, e as tarefas
  -- do atendimento natural por IA buscam etapa por nome (`Novo Lead`,
  -- `Em Negociação`, ...): a criação de oportunidade pela IA falha em
  -- silêncio para essas empresas. Ver AGENTS.md, seção "Funil padrão de
  -- empresa nova", para o detalhe e o que falta corrigir.
  insert into public.pipelines (location_id, name, position)
  values (loc, '✅ Controle de Leads', 0)
  returning id into pipe;

  -- Funil genérico de vendas, sem nada específico do produto do dono da
  -- plataforma. Os nomes abaixo são contrato: as Tasks 4 e 5 do
  -- atendimento natural por IA procuram etapa por este nome exato.
  insert into public.stages (location_id, pipeline_id, name, color, position)
  values
    (loc, pipe, 'Novo Lead',        '#3b82f6', 0),
    (loc, pipe, 'Proposta Enviada', '#f97316', 1),
    (loc, pipe, 'Em Negociação',    '#a855f7', 2),
    (loc, pipe, 'Fechado/Ganho',    '#22c55e', 3),
    (loc, pipe, 'Perdido',          '#ef4444', 4);

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
