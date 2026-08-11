-- ============================================================
-- Lito CRM — Pagamentos: Arquivos e contratos (upload PDF/DOCX)
--
-- A aba "Arquivos e contratos" guarda documentos (contratos, propostas)
-- por empresa. Os binários vão para um bucket privado do Supabase Storage
-- (`payment-files`), com um caminho `{location_id}/{uuid}.{ext}`; os metadados
-- (nome original, tamanho, tipo, quem subiu) ficam em `public.payment_files`.
--
-- Segue o MESMO padrão multi-tenant das outras tabelas: RLS deny-by-default,
-- REVOKE do anon, políticas TO authenticated com checagem de membership via
-- private.user_locations(). As policies de storage.objects espelham isso pelo
-- primeiro segmento do caminho (a pasta = o location_id).
--
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================
set check_function_bodies = off;

-- ---------- Bucket privado ----------
insert into storage.buckets (id, name, public)
values ('payment-files', 'payment-files', false)
on conflict (id) do nothing;

-- ---------- Metadados dos arquivos ----------
create table if not exists public.payment_files (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,               -- nome original do arquivo (ex.: "Contrato.pdf")
  path text not null,               -- caminho no bucket: {location_id}/{uuid}.{ext}
  size bigint,                      -- bytes
  mime text,                        -- application/pdf | ...wordprocessingml.document
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, path)
);

create index if not exists payment_files_location_idx
  on public.payment_files (location_id, created_at desc);

alter table public.payment_files enable row level security;
revoke all on public.payment_files from anon;

drop policy if exists "membros leem arquivos" on public.payment_files;
create policy "membros leem arquivos" on public.payment_files
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam arquivos" on public.payment_files;
create policy "membros criam arquivos" on public.payment_files
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem arquivos" on public.payment_files;
create policy "membros excluem arquivos" on public.payment_files
  for delete to authenticated
  using (location_id in (select private.user_locations()));

drop trigger if exists payment_files_updated_at on public.payment_files;
create trigger payment_files_updated_at
  before update on public.payment_files
  for each row execute function private.set_updated_at();

-- ---------- Políticas do Storage (bucket payment-files) ----------
-- A pasta raiz do objeto é o location_id; membros da empresa leem/gravam/apagam
-- só o que está sob a pasta da própria empresa.
drop policy if exists "membros leem storage de pagamentos" on storage.objects;
create policy "membros leem storage de pagamentos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros gravam storage de pagamentos" on storage.objects;
create policy "membros gravam storage de pagamentos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros apagam storage de pagamentos" on storage.objects;
create policy "membros apagam storage de pagamentos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-files'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );
