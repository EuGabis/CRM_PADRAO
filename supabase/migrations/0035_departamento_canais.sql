-- ============================================================
-- Lito CRM — Segmentação de conversas por número (canal) do WhatsApp
--
-- O departamento já dizia QUAIS MÓDULOS a pessoa acessa (0033). Agora diz
-- também DE QUAIS NÚMEROS ela vê conversa.
--
-- Regras decididas com o Gabriel (2026-08-14):
--   1. O vínculo é do DEPARTAMENTO, não da pessoa: número ligado ao Comercial
--      vale para todo o Comercial.
--   2. Departamento sem número vinculado = sem restrição (vê tudo). Assim
--      nenhum departamento existente perde acesso ao aplicar esta migração.
--   3. Conversa SEM canal (e-mail, Instagram, WhatsApp antigo sem número)
--      continua visível para todos — a restrição vale só para o WhatsApp que
--      já tem número vinculado.
--   4. Administrador vê tudo, como no resto do sistema.
--
-- Isso é RLS de verdade, não filtro de tela: quem não pode ver a conversa não
-- a recebe nem pela API.
--
-- Idempotente.
-- ============================================================
set check_function_bodies = off;

-- ---------- 1. Vínculo departamento ↔ número ----------

create table if not exists public.department_channels (
  department_id uuid not null references public.departments (id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, channel_id)
);

create index if not exists department_channels_channel_idx
  on public.department_channels (channel_id);

alter table public.department_channels enable row level security;
revoke all on public.department_channels from anon;

drop policy if exists "membros leem canais do depto" on public.department_channels;
create policy "membros leem canais do depto" on public.department_channels
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "admins criam canais do depto" on public.department_channels;
create policy "admins criam canais do depto" on public.department_channels
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem canais do depto" on public.department_channels;
create policy "admins excluem canais do depto" on public.department_channels
  for delete to authenticated
  using (private.is_admin(location_id));

-- ---------- 2. O usuário pode ver este canal? ----------

-- SECURITY DEFINER porque consulta location_members/department_channels, que
-- têm RLS própria — mesmo padrão de private.user_locations().
create or replace function private.channel_allowed(loc uuid, chan uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    -- 3: conversa sem número não entra na segmentação
    chan is null
    -- 4: admin vê tudo
    or private.is_admin(loc)
    -- 2: departamento sem número vinculado (ou usuário sem departamento) = sem restrição
    or not exists (
      select 1
        from public.location_members lm
        join public.department_channels dc on dc.department_id = lm.department_id
       where lm.user_id = auth.uid()
         and lm.location_id = loc
    )
    -- 1: o número está entre os do departamento da pessoa
    or exists (
      select 1
        from public.location_members lm
        join public.department_channels dc on dc.department_id = lm.department_id
       where lm.user_id = auth.uid()
         and lm.location_id = loc
         and dc.channel_id = chan
    );
$$;

revoke all on function private.channel_allowed(uuid, uuid) from public, anon;
grant execute on function private.channel_allowed(uuid, uuid) to authenticated;

-- ---------- 3. Aplicar nas conversas e mensagens ----------

-- As policies "membros leem"/"membros editam" vêm do laço da 0001. Recriadas
-- aqui com o filtro de canal por cima do filtro de empresa — o de empresa
-- continua igual, não é afrouxado em nada.
drop policy if exists "membros leem" on public.conversations;
create policy "membros leem" on public.conversations
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros editam" on public.conversations;
create policy "membros editam" on public.conversations
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros leem" on public.messages;
create policy "membros leem" on public.messages
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

drop policy if exists "membros editam" on public.messages;
create policy "membros editam" on public.messages
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  )
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );

-- Enviar mensagem num canal que a pessoa não enxerga também não pode.
drop policy if exists "membros criam" on public.messages;
create policy "membros criam" on public.messages
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and private.channel_allowed(location_id, channel_id)
  );
