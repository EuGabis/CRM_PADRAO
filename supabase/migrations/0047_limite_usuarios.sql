-- ============================================================
-- 0047 — Limite de usuários por empresa
--
-- Barra nos DOIS pontos, de propósito:
--   * location_members — a entrada de fato
--   * invitations      — senão o admin cria convites à vontade e a falha
--                        aparece para o CONVIDADO, no meio do cadastro dele
--
-- A contagem soma membros + convites PENDENTES. Ignorar os pendentes
-- deixaria estourar o limite disparando vários convites antes de qualquer
-- um ser aceito.
--
-- No banco e não na tela: o admin do cliente tem sessão válida e chama a
-- API direto. Mesma lição da 0040 (esconder o botão nao impedia o delete).
-- ============================================================

create or replace function private.enforce_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
  loc   uuid := new.location_id;
  mail  text;
begin
  select max_users into lim from public.location_limits where location_id = loc;

  -- null = ilimitado. Zero é diferente de null e bloqueia.
  if lim is null then
    return new;
  end if;

  -- Promessa já feita: se a pessoa que está entrando tem convite PENDENTE nesta
  -- empresa, o slot dela foi reservado quando o convite foi criado -- e naquele
  -- momento o trigger de invitations validou o limite. Entrar tem que funcionar
  -- mesmo que o dono da plataforma tenha REDUZIDO max_users depois.
  --
  -- Sem isto, o convidado se cadastra, o trigger levanta exceção dentro de
  -- private.handle_new_user (que roda na transação de signup), o usuário do Auth
  -- é desfeito junto e a pessoa vê um erro cru do GoTrue. NÃO "simplifique"
  -- removendo este bloco.
  --
  -- Ler auth.users aqui é seguro: a função é security definer e só usa o e-mail
  -- do próprio usuário que está sendo inserido.
  if TG_TABLE_NAME = 'location_members' then
    select u.email into mail from auth.users u where u.id = new.user_id;
    if mail is not null and exists (
      select 1 from public.invitations i
       where i.location_id = loc
         and i.status = 'pending'
         and lower(i.email) = lower(mail)
    ) then
      return new;
    end if;
  end if;

  -- A contagem diferencia por tabela de origem via TG_TABLE_NAME:
  -- * location_members: conta SOMENTE os membros. O convite pendente correspondente
  --   ainda nao foi marcado 'accepted', entao nao contar junto evita double-counting
  --   quando alguem usa um convite para se registrar.
  -- * invitations: conta membros + convites pendentes. Impede criar multiplos
  --   convites de uma vez ultrapassando o limite.
  if TG_TABLE_NAME = 'location_members' then
    select count(*) from public.location_members where location_id = loc
      into atual;
  else
    select (select count(*) from public.location_members where location_id = loc)
         + (select count(*) from public.invitations
             where location_id = loc and status = 'pending')
      into atual;
  end if;

  if atual >= lim then
    raise exception 'LIMITE_USUARIOS: esta empresa atingiu o limite de % usuarios (membros + convites pendentes)', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_user_limit() from public, anon, authenticated;

drop trigger if exists enforce_user_limit_members on public.location_members;
create trigger enforce_user_limit_members
  before insert on public.location_members
  for each row execute function private.enforce_user_limit();

drop trigger if exists enforce_user_limit_invites on public.invitations;
create trigger enforce_user_limit_invites
  before insert on public.invitations
  for each row execute function private.enforce_user_limit();
