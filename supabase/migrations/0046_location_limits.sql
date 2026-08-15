-- ============================================================
-- 0046 — Limites por empresa (camada de plataforma)
--
-- Tabela SEPARADA de public.locations de propósito. A locations tem
-- "admin edita location" (0001) com using/with check private.is_admin(id),
-- então qualquer coluna de limite guardada lá seria escrevível pelo admin
-- do próprio cliente via API — sem precisar de botão na tela.
--
-- Aqui: membro LÊ (a UI precisa explicar o bloqueio), ninguém com papel
-- authenticated ESCREVE. Só a service_role, ou seja, o dono da plataforma
-- pelo SQL Editor.
-- ============================================================

create table if not exists public.location_limits (
  location_id           uuid primary key references public.locations (id) on delete cascade,
  max_users             int,
  max_whatsapp_channels int,
  disabled_modules      text[] not null default '{}',
  notes                 text,
  updated_at            timestamptz not null default now()
);

alter table public.location_limits enable row level security;

revoke all on public.location_limits from anon;

-- Só SELECT. A ausência de policy de insert/update/delete é a proteção:
-- RLS é deny-by-default, então authenticated não escreve de jeito nenhum.
drop policy if exists "membros leem os limites da sua empresa" on public.location_limits;
create policy "membros leem os limites da sua empresa" on public.location_limits
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ------------------------------------------------------------
-- Semente da empresa nova
--
-- disabled_modules é lista de BLOQUEIO, não de liberação: módulo novo do
-- produto nasce disponível para todo mundo. Com lista de liberação, todo
-- módulo novo ficaria invisível para as empresas existentes.
--
-- Os quatro bloqueados consomem credenciais GLOBAIS (OPENAI_API_KEY,
-- RESEND_API_KEY, WHATSAPP_TOKEN): o consumo de qualquer cliente cai na
-- conta do dono da plataforma. Nascem desligados; o dono liga quando o
-- cliente vira pagante.
-- ------------------------------------------------------------
create or replace function private.seed_location_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_limits (location_id, disabled_modules)
  values (new.id, '{ai-studio,agentes-ia,marketing,whatsapp}')
  on conflict (location_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_location_limits() from public, anon, authenticated;

-- Trigger próprio em vez de editar private.on_location_created (0033):
-- mesmo padrão aditivo que a 0033 usou para não reescrever handle_new_user.
drop trigger if exists seed_limits_on_location on public.locations;
create trigger seed_limits_on_location
  after insert on public.locations
  for each row execute function private.seed_location_limits();

-- Retrocompatibilidade: empresas que já existiam antes desta migração ganham
-- a linha de limites SEM nenhum módulo bloqueado.
--
-- Só empresa NOVA (trigger acima) nasce com os quatro módulos desligados.
-- Empresa existente é o dono da plataforma ou cliente já em operação: aplicar
-- o bloqueio retroativamente derrubaria IA, Marketing e WhatsApp de quem já
-- usa, sem aviso. Quem precisar limitar um cliente antigo faz o update à mão.
insert into public.location_limits (location_id, disabled_modules)
select id, '{}'
  from public.locations
on conflict (location_id) do nothing;

grant select on public.location_limits to authenticated;
grant all privileges on public.location_limits to service_role;
