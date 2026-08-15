-- ============================================================
-- CRM ON — WhatsApp (Meta Cloud API): canais + status/ids nas mensagens
--
-- Canais de atendimento (números) em whatsapp_channels; as mensagens de
-- WhatsApp ganham wa_message_id (casa os status do webhook), status
-- (sent/delivered/read/failed) e channel_id (qual número). Segue o padrão
-- multi-tenant: RLS deny-by-default, revoke do anon, policies TO authenticated
-- por membership. Idempotente.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,                       -- nome interno (ex.: "Comercial Vendas")
  meta_name text not null default '',       -- nome verificado na Meta
  phone_e164 text not null default '',      -- número exibido (ex.: +55 11 9...)
  phone_number_id text not null,            -- id do número na Meta (resolve o webhook)
  waba_id text not null default '',         -- id da WABA (lista templates)
  sector text not null default '',          -- setor (ex.: "Comercial Principal")
  daily_limit int not null default 1000,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (phone_number_id)
);

create index if not exists whatsapp_channels_location_idx
  on public.whatsapp_channels (location_id, created_at desc);

alter table public.whatsapp_channels enable row level security;
revoke all on public.whatsapp_channels from anon;

drop policy if exists "membros leem canais wa" on public.whatsapp_channels;
create policy "membros leem canais wa" on public.whatsapp_channels
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam canais wa" on public.whatsapp_channels;
create policy "membros criam canais wa" on public.whatsapp_channels
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros editam canais wa" on public.whatsapp_channels;
create policy "membros editam canais wa" on public.whatsapp_channels
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem canais wa" on public.whatsapp_channels;
create policy "membros excluem canais wa" on public.whatsapp_channels
  for delete to authenticated
  using (location_id in (select private.user_locations()));

-- Conversa lembra qual canal de WhatsApp a originou (nulo p/ outros canais)
alter table public.conversations add column if not exists channel_id uuid
  references public.whatsapp_channels (id) on delete set null;

-- Colunas nas mensagens
alter table public.messages add column if not exists wa_message_id text;
alter table public.messages add column if not exists status text
  check (status in ('sent', 'delivered', 'read', 'failed'));
alter table public.messages add column if not exists channel_id uuid
  references public.whatsapp_channels (id) on delete set null;
drop index if exists messages_wa_message_id_idx;
create unique index if not exists messages_wa_message_id_key
  on public.messages (wa_message_id)
  where wa_message_id is not null;

-- Realtime: precisamos do row completo no UPDATE (status entregue/lido ao vivo)
alter table public.messages replica identity full;
