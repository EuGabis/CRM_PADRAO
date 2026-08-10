-- ============================================================
-- Lito CRM — Assinaturas da Guru (estado atual por assinante)
--
-- `payment_events` (migração 0008) já guarda o log bruto de tudo que a
-- Guru envia. Esta tabela guarda o estado ATUAL de cada assinatura —
-- a rota /api/webhooks/guru faz upsert aqui sempre que o evento traz um
-- id de assinatura reconhecível, então a aba Assinaturas mostra quem
-- está ativo/atrasado/cancelado sem precisar reprocessar o log inteiro.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.payment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text not null,
  status text,
  contact_name text,
  contact_email text,
  product_name text,
  amount numeric,
  currency text default 'BRL',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider, external_id)
);

create index if not exists payment_subscriptions_location_idx
  on public.payment_subscriptions (location_id, updated_at desc);

alter table public.payment_subscriptions enable row level security;
revoke all on public.payment_subscriptions from anon;

drop policy if exists "membros leem assinaturas" on public.payment_subscriptions;
create policy "membros leem assinaturas" on public.payment_subscriptions
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de webhook (service role, ignora RLS).

drop trigger if exists payment_subscriptions_updated_at on public.payment_subscriptions;
create trigger payment_subscriptions_updated_at
  before update on public.payment_subscriptions
  for each row execute function private.set_updated_at();

alter publication supabase_realtime add table public.payment_subscriptions;
