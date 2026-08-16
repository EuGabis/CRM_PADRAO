-- ============================================================
-- 0052 — Primeiro acesso e tipo de canal de WhatsApp
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ------------------------------------------------------------
-- A 0001 dá ao usuário a policy "editar o próprio perfil", então sem isto
-- ele marcaria a própria coluna como false e pularia a troca de senha.
-- Neste caso o estrago seria pequeno (pula uma tela), mas o mesmo descuido
-- em outra coluna não seria — a proteção fica no banco.
-- ------------------------------------------------------------
create or replace function private.protect_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_change_password is distinct from old.must_change_password
     and (select auth.uid()) is not null then
    raise exception 'must_change_password so pode ser alterada pelo servidor'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_must_change_password() from public, anon, authenticated;

drop trigger if exists protect_must_change_password on public.profiles;
create trigger protect_must_change_password
  before update on public.profiles
  for each row execute function private.protect_must_change_password();

-- ------------------------------------------------------------
-- Tipo de canal de WhatsApp da empresa.
--
-- Hoje SÓ ARMAZENA: o WhatsApp não oficial ainda não existe no projeto
-- (o módulo inteiro é Meta Cloud API). Gravar desde já significa que as
-- empresas cadastradas antes já estarão marcadas quando ele for construído.
-- ------------------------------------------------------------
alter table public.location_limits
  add column if not exists whatsapp_provider text not null default 'meta';

alter table public.location_limits
  drop constraint if exists location_limits_whatsapp_provider_check;
alter table public.location_limits
  add constraint location_limits_whatsapp_provider_check
  check (whatsapp_provider in ('meta', 'evolution'));
