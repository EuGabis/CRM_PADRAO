-- ============================================================
-- CRM ON — Integração de pagamentos: Digital Manager Guru
--
-- Guru avisa vendas/assinaturas via webhook (POST com JSON), autenticado
-- pelo campo `api_token` do corpo — o mesmo valor mostrado no painel da
-- Guru em Configurações > Webhook. Guardamos esse token por empresa em
-- `payment_credentials` e usamos pra reconhecer de qual empresa é cada
-- evento recebido em `/api/webhooks/guru` (rota pública, sem sessão —
-- roda com a service role, como o motor de automações).
-- ============================================================
set check_function_bodies = off;

-- ---------- Credenciais do provedor (uma linha por empresa+provedor) ----------
create table if not exists public.payment_credentials (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  api_key text,
  webhook_token text not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider)
);

-- a rota de webhook busca a empresa pelo token recebido
create unique index if not exists payment_credentials_webhook_token_idx
  on public.payment_credentials (provider, webhook_token);

alter table public.payment_credentials enable row level security;
revoke all on public.payment_credentials from anon;

drop policy if exists "admins leem credenciais" on public.payment_credentials;
create policy "admins leem credenciais" on public.payment_credentials
  for select to authenticated
  using (private.is_admin(location_id));

drop policy if exists "admins criam credenciais" on public.payment_credentials;
create policy "admins criam credenciais" on public.payment_credentials
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins editam credenciais" on public.payment_credentials;
create policy "admins editam credenciais" on public.payment_credentials
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem credenciais" on public.payment_credentials;
create policy "admins excluem credenciais" on public.payment_credentials
  for delete to authenticated
  using (private.is_admin(location_id));

drop trigger if exists payment_credentials_updated_at on public.payment_credentials;
create trigger payment_credentials_updated_at
  before update on public.payment_credentials
  for each row execute function private.set_updated_at();

-- ---------- Eventos recebidos (vendas, assinaturas etc.) ----------
-- `raw` guarda o payload inteiro: o schema público da Guru não está
-- totalmente documentado, então os campos abaixo são melhor-esforço
-- (ver parseGuruPayload em src/lib/data/repos/db/payments.ts) e `raw`
-- é a fonte de verdade caso algum campo mude de nome.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text,
  event_type text,
  status text,
  amount numeric,
  currency text default 'BRL',
  contact_name text,
  contact_email text,
  product_name text,
  raw jsonb not null default '{}',
  received_at timestamptz not null default now()
);

create index if not exists payment_events_location_idx
  on public.payment_events (location_id, received_at desc);
-- evita duplicar o mesmo evento se a Guru reenviar (retry)
create unique index if not exists payment_events_dedup_idx
  on public.payment_events (location_id, provider, external_id)
  where external_id is not null;

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon;

drop policy if exists "membros leem eventos" on public.payment_events;
create policy "membros leem eventos" on public.payment_events
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de webhook (service role, ignora RLS) — sem
-- política de insert/update/delete para authenticated de propósito.

alter publication supabase_realtime add table public.payment_events;
