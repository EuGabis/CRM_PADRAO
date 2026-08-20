-- ============================================================
-- CRM ON — Painel do contato: abas Tarefas, Observações e Arquivos
--
-- PROPÓSITO
--
-- As abas novas do painel lateral do contato precisam de: (1) tarefas
-- ligadas ao contato, (2) observações de texto livre e (3) arquivos
-- anexados ao contato (não à conversa — esses já existem em
-- `conversation-media` desde a 0019).
--
-- DECISÃO: tarefa é `public.appointments` com `kind = 'tarefa'`.
--
-- O dono decidiu reusar `appointments` em vez de criar `tasks` como tabela
-- separada, porque uma tarefa precisa aparecer no Calendário junto dos
-- compromissos — telas, RLS e índice de `appointments` já fazem isso.
-- `kind` distingue os dois no mesmo registro; `done` só faz sentido para
-- `kind = 'tarefa'` (compromisso não tem "concluído", tem aconteceu ou não
-- pela data), mas fica na tabela toda por simplicidade — nenhuma tela lê
-- `done` de um `kind = 'compromisso'`.
--
-- `contact_notes` e `contact_files` seguem o padrão multi-tenant de sempre:
-- RLS por `location_id in (select private.user_locations())`, com GRANT de
-- tabela para `authenticated` (sem ele a RLS nem é avaliada — ver 0055 e o
-- item 9 do AGENTS.md). Nenhuma coluna secreta aqui, então grant de tabela
-- inteira está ok — nada equivalente ao `revoke select (coluna)` da 0058.
--
-- `contact-files` é um bucket privado novo, no mesmo padrão de storage da
-- 0019 (`conversation-media`): caminho `{location_id}/...`, políticas por
-- primeiro segmento do nome do objeto, `file_size_limit` já definido na
-- criação (como a 0059 fez depois, aqui de saída).
--
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================
set check_function_bodies = off;

-- ---------- 1. Tarefa como tipo de compromisso ----------
-- Uma tarefa é um compromisso com kind = 'tarefa'; aparece no Calendário
-- porque reusa a mesma tabela, índice e RLS de appointments.
alter table public.appointments
  add column if not exists kind text not null default 'compromisso'
    check (kind in ('compromisso', 'tarefa'));

alter table public.appointments
  add column if not exists done boolean not null default false;

-- ---------- 2. Observações do contato ----------
create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  body text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_notes_location_contact_idx
  on public.contact_notes (location_id, contact_id, created_at desc);

-- ---------- 3. Arquivos do contato (metadados; binário no Storage) ----------
create table if not exists public.contact_files (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_mime text,
  file_size bigint,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_files_location_contact_idx
  on public.contact_files (location_id, contact_id, created_at desc);

-- ---------- RLS: habilitar + políticas (mesmo padrão das tabelas de domínio) ----------
alter table public.contact_notes enable row level security;
alter table public.contact_files enable row level security;

drop policy if exists "membros leem" on public.contact_notes;
create policy "membros leem" on public.contact_notes
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam" on public.contact_notes;
create policy "membros criam" on public.contact_notes
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros editam" on public.contact_notes;
create policy "membros editam" on public.contact_notes
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.contact_notes;
create policy "membros excluem" on public.contact_notes
  for delete to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros leem" on public.contact_files;
create policy "membros leem" on public.contact_files
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam" on public.contact_files;
create policy "membros criam" on public.contact_files
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros editam" on public.contact_files;
create policy "membros editam" on public.contact_files
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.contact_files;
create policy "membros excluem" on public.contact_files
  for delete to authenticated
  using (location_id in (select private.user_locations()));

-- ---------- 4. Bucket privado contact-files ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('contact-files', 'contact-files', false, 20 * 1024 * 1024) -- 20 MB
on conflict (id) do nothing;

drop policy if exists "membros leem arquivos de contato" on storage.objects;
create policy "membros leem arquivos de contato" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contact-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros gravam arquivos de contato" on storage.objects;
create policy "membros gravam arquivos de contato" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contact-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros apagam arquivos de contato" on storage.objects;
create policy "membros apagam arquivos de contato" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contact-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

-- ---------- 5. Grants para authenticated ----------
-- Sem isto a RLS acima nunca é avaliada (42501 permission denied) — mesma
-- armadilha documentada na 0055. Sem coluna secreta aqui, grant de tabela
-- inteira está ok.
grant select, insert, update, delete
  on public.contact_notes, public.contact_files to authenticated;
