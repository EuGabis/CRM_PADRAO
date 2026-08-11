-- ============================================================
-- Lito CRM — Contatos reais da Guru (GET /api/v2/contacts)
--
-- A aba Contatos até aqui (migração 0016) agregava contatos a partir de
-- payment_events/payment_subscriptions — só cobre quem já apareceu numa
-- venda/assinatura sincronizada, e nunca captura telefone/documento (esses
-- campos não existem nas tabelas base). A Guru tem um endpoint de contatos
-- dedicado (referencia-api/contacts.yaml) com nome/email/doc/telefone e uma
-- contagem própria (total_rows) — é o número que aparece no painel da Guru
-- (ex.: 7423) e não necessariamente é igual ao de compradores únicos.
--
-- payment_guru_contacts: uma linha por contato da Guru, sincronizada em
-- pedaços (contacts_sync_cursor/contacts_sync_done/contacts_total_rows em
-- payment_credentials) pelo mesmo /api/integrations/guru/sync — ver
-- contactsSyncChunk().
-- ============================================================
set check_function_bodies = off;

create table if not exists public.payment_guru_contacts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text,
  email text,
  doc text,
  phone text,
  guru_created_at timestamptz,
  guru_updated_at timestamptz,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, provider, external_id)
);

create index if not exists payment_guru_contacts_location_idx
  on public.payment_guru_contacts (location_id, name);
create index if not exists payment_guru_contacts_doc_idx
  on public.payment_guru_contacts (location_id, doc);
create index if not exists payment_guru_contacts_phone_idx
  on public.payment_guru_contacts (location_id, phone);

alter table public.payment_guru_contacts enable row level security;
revoke all on public.payment_guru_contacts from anon;

drop policy if exists "membros leem contatos guru" on public.payment_guru_contacts;
create policy "membros leem contatos guru" on public.payment_guru_contacts
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- Escrita só pela rota de sync (service role, ignora RLS).

drop trigger if exists payment_guru_contacts_updated_at on public.payment_guru_contacts;
create trigger payment_guru_contacts_updated_at
  before update on public.payment_guru_contacts
  for each row execute function private.set_updated_at();

alter table public.payment_credentials
  add column if not exists contacts_sync_cursor text,
  add column if not exists contacts_sync_done boolean not null default false,
  add column if not exists contacts_total_rows int;
