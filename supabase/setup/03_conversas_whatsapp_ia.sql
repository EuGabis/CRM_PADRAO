-- ============================================================
-- SETUP 03_conversas_whatsapp_ia
-- GERADO por scripts/gerar-setup.ps1 -- nao edite a mao.
-- Fonte: supabase/migrations/, em ordem cronologica real.
-- Rode as partes 01 -> 04 EM ORDEM no SQL Editor. Ver README.md.
-- ============================================================

-- ------------------------------------------------------------
-- 0019_conversation_media.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversas: anexos e Ã¡udio (Supabase Storage)
--
-- O composer da caixa de entrada passa a enviar imagens, documentos
-- (PDF/DOCX) e Ã¡udios gravados pelo microfone. Os binÃ¡rios vÃ£o para um
-- bucket PRIVADO (`conversation-media`) com caminho
-- `{location_id}/{conversation_id}/{uuid}.{ext}`; os metadados ficam na
-- prÃ³pria linha de `public.messages` (media_path/name/mime/size), e a
-- exibiÃ§Ã£o usa URL assinada temporÃ¡ria.
--
-- Segue o MESMO padrÃ£o multi-tenant das demais migraÃ§Ãµes: bucket privado,
-- polÃ­ticas de storage.objects pelo primeiro segmento do caminho (= o
-- location_id), checagem de membership via private.user_locations().
--
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================
set check_function_bodies = off;

-- ---------- Bucket privado ----------
insert into storage.buckets (id, name, public)
values ('conversation-media', 'conversation-media', false)
on conflict (id) do nothing;

-- ---------- Novos tipos de mensagem + colunas de mÃ­dia ----------
-- 'image' e 'file' juntam-se a text/audio/event.
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'audio', 'image', 'file', 'event'));

alter table public.messages add column if not exists media_path text;  -- {location_id}/{conversation_id}/{uuid}.{ext}
alter table public.messages add column if not exists media_name text;  -- nome original (ex.: "Proposta.pdf")
alter table public.messages add column if not exists media_mime text;  -- image/png | application/pdf | audio/webm | ...
alter table public.messages add column if not exists media_size bigint; -- bytes

-- ---------- PolÃ­ticas do Storage (bucket conversation-media) ----------
-- A pasta raiz do objeto Ã© o location_id; membros da empresa leem/gravam/apagam
-- sÃ³ o que estÃ¡ sob a pasta da prÃ³pria empresa.
drop policy if exists "membros leem midia de conversas" on storage.objects;
create policy "membros leem midia de conversas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'conversation-media'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros gravam midia de conversas" on storage.objects;
create policy "membros gravam midia de conversas" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'conversation-media'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );

drop policy if exists "membros apagam midia de conversas" on storage.objects;
create policy "membros apagam midia de conversas" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'conversation-media'
    and nullif((storage.foldername(name))[1], '')::uuid in (select private.user_locations())
  );


-- ------------------------------------------------------------
-- 0022_whatsapp.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” WhatsApp (Meta Cloud API): canais + status/ids nas mensagens
--
-- Canais de atendimento (nÃºmeros) em whatsapp_channels; as mensagens de
-- WhatsApp ganham wa_message_id (casa os status do webhook), status
-- (sent/delivered/read/failed) e channel_id (qual nÃºmero). Segue o padrÃ£o
-- multi-tenant: RLS deny-by-default, revoke do anon, policies TO authenticated
-- por membership. Idempotente.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,                       -- nome interno (ex.: "Lito Academy Vendas")
  meta_name text not null default '',       -- nome verificado na Meta
  phone_e164 text not null default '',      -- nÃºmero exibido (ex.: +55 11 9...)
  phone_number_id text not null,            -- id do nÃºmero na Meta (resolve o webhook)
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


-- ------------------------------------------------------------
-- 0023_google_ads.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Google Ads (VisÃ£o geral, somente leitura)
--
-- ConexÃ£o OAuth por empresa: guarda refresh_token + customer_id para ler a conta
-- via API. O refresh_token Ã© SEGREDO: coluna com `revoke select` de anon/authenticated;
-- sÃ³ as rotas server (service-role) leem. Demais colunas (status) os membros leem.
-- PadrÃ£o multi-tenant: RLS membership, revoke do anon. Idempotente.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.google_ads_connections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  customer_id text not null,               -- id da conta Google Ads (sem hÃ­fens)
  login_customer_id text,                  -- id da MCC quando aplicÃ¡vel (nulo p/ conta direta)
  refresh_token text not null,             -- SEGREDO (coluna revogada abaixo)
  connected_email text not null default '',
  currency_code text not null default 'BRL',
  connected_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id)
);

alter table public.google_ads_connections enable row level security;
revoke all on public.google_ads_connections from anon;

drop policy if exists "membros leem conexao google ads" on public.google_ads_connections;
create policy "membros leem conexao google ads" on public.google_ads_connections
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam conexao google ads" on public.google_ads_connections;
create policy "membros criam conexao google ads" on public.google_ads_connections
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros atualizam conexao google ads" on public.google_ads_connections;
create policy "membros atualizam conexao google ads" on public.google_ads_connections
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem conexao google ads" on public.google_ads_connections;
create policy "membros excluem conexao google ads" on public.google_ads_connections
  for delete to authenticated
  using (location_id in (select private.user_locations()));

-- Segredo: membros NÃƒO podem ler o refresh_token (sÃ³ as rotas server com service-role).
revoke select (refresh_token) on public.google_ads_connections from anon, authenticated;

drop trigger if exists google_ads_connections_updated_at on public.google_ads_connections;
create trigger google_ads_connections_updated_at
  before update on public.google_ads_connections
  for each row execute function private.set_updated_at();


-- ------------------------------------------------------------
-- 0024_forms.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” FormulÃ¡rios de captaÃ§Ã£o (Sites â†’ FormulÃ¡rios)
--
-- `forms`: config do formulÃ¡rio (campos, aÃ§Ã£o de sucesso, tag, lista inteligente).
-- `form_submissions`: histÃ³rico de cada envio. O envio pÃºblico (rota /api/forms/*)
-- grava com a service role; membros LEEM via RLS. PadrÃ£o multi-tenant. Idempotente.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  slug text not null unique,                 -- id pÃºblico usado no embed
  name text not null,
  description text not null default '',
  fields jsonb not null default '[]',        -- FormField[]
  success_action text not null default 'message' check (success_action in ('redirect', 'message')),
  success_value text not null default 'Obrigado! Recebemos seu contato.',
  tag text not null,                          -- tag aplicada ao contato no envio
  smart_list_id uuid references public.smart_lists (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forms_location_idx on public.forms (location_id, created_at desc);

alter table public.forms enable row level security;
revoke all on public.forms from anon;

drop policy if exists "membros leem forms" on public.forms;
create policy "membros leem forms" on public.forms
  for select to authenticated using (location_id in (select private.user_locations()));
drop policy if exists "membros criam forms" on public.forms;
create policy "membros criam forms" on public.forms
  for insert to authenticated with check (location_id in (select private.user_locations()));
drop policy if exists "membros editam forms" on public.forms;
create policy "membros editam forms" on public.forms
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));
drop policy if exists "membros excluem forms" on public.forms;
create policy "membros excluem forms" on public.forms
  for delete to authenticated using (location_id in (select private.user_locations()));

drop trigger if exists forms_updated_at on public.forms;
create trigger forms_updated_at before update on public.forms
  for each row execute function private.set_updated_at();

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists form_submissions_form_idx on public.form_submissions (form_id, created_at desc);

alter table public.form_submissions enable row level security;
revoke all on public.form_submissions from anon;

-- Membros LEEM/EXCLUEM; a inserÃ§Ã£o Ã© feita pela rota pÃºblica com service role (bypassa RLS).
drop policy if exists "membros leem envios" on public.form_submissions;
create policy "membros leem envios" on public.form_submissions
  for select to authenticated using (location_id in (select private.user_locations()));
drop policy if exists "membros excluem envios" on public.form_submissions;
create policy "membros excluem envios" on public.form_submissions
  for delete to authenticated using (location_id in (select private.user_locations()));


-- ------------------------------------------------------------
-- 0025_conversas_atribuicao.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversas: responsÃ¡vel pelo atendimento
--
-- O rail da caixa de entrada tinha "AtribuÃ­das a mim", mas `conversations`
-- nÃ£o guardava responsÃ¡vel nenhum â€” o botÃ£o sÃ³ emitia um toast porque nÃ£o
-- havia o que filtrar. Esta coluna dÃ¡ lastro ao filtro e ao seletor de
-- responsÃ¡vel no cabeÃ§alho da conversa.
--
-- `on delete set null`: se o membro sair da equipe, a conversa volta para a
-- caixa do grupo em vez de sumir do filtro de todo mundo.
--
-- Idempotente.
-- ============================================================

alter table public.conversations
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null;

-- O filtro "atribuÃ­das a mim" Ã© sempre location + responsÃ¡vel.
create index if not exists conversations_assigned_idx
  on public.conversations (location_id, assigned_to);


-- ------------------------------------------------------------
-- 0026_ai_logs.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” FundaÃ§Ã£o de IA: logs de geraÃ§Ã£o (ai_logs)
--
-- Uma linha por chamada ao /api/ai/generate: modelo, prompt, resposta, tokens,
-- quem chamou. PadrÃ£o multi-tenant: RLS membership, revoke do anon. Membros leem
-- e inserem (a rota roda com a sessÃ£o do usuÃ¡rio). Idempotente.
-- ============================================================
set check_function_bodies = off;

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  feature text not null default 'generate',      -- ex.: playground, content, inbox-suggest
  model text not null default '',
  prompt text not null default '',
  response text not null default '',
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_logs_location_idx on public.ai_logs (location_id, created_at desc);

alter table public.ai_logs enable row level security;
revoke all on public.ai_logs from anon;

drop policy if exists "membros leem ai_logs" on public.ai_logs;
create policy "membros leem ai_logs" on public.ai_logs
  for select to authenticated using (location_id in (select private.user_locations()));

drop policy if exists "membros criam ai_logs" on public.ai_logs;
create policy "membros criam ai_logs" on public.ai_logs
  for insert to authenticated with check (location_id in (select private.user_locations()));


-- ------------------------------------------------------------
-- 0027_conversas_rail.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversas: rail funcional (bot/automaÃ§Ã£o + visualizaÃ§Ãµes salvas)
--
-- 1) messages.automated â€” marca a mensagem que NÃƒO foi escrita por uma pessoa
--    (motor de automaÃ§Ãµes hoje; agente de IA amanhÃ£). Ã‰ o que dÃ¡ lastro ao
--    filtro "Conversas com automaÃ§Ã£o" do rail â€” antes ele era sÃ³ um Ã­cone.
-- 2) inbox_views â€” visualizaÃ§Ãµes salvas de verdade. Antes eram quatro nomes
--    fixos no cÃ³digo (ORGANIZAR, LEADS LUCAS, ...) que sÃ³ emitiam um toast.
--
-- PadrÃ£o multi-tenant de sempre: RLS membership, revoke do anon, UPDATE com
-- USING + WITH CHECK. Idempotente.
-- ============================================================

-- 1) Marcador de mensagem automÃ¡tica ------------------------------------------

alter table public.messages
  add column if not exists automated boolean not null default false;

-- Ãndice parcial: a lista pergunta "quais conversas tÃªm mensagem automÃ¡tica?",
-- entÃ£o sÃ³ as linhas automÃ¡ticas interessam (hoje, a minoria).
create index if not exists messages_automated_idx
  on public.messages (location_id, conversation_id)
  where automated;

-- 2) VisualizaÃ§Ãµes salvas da caixa de entrada ---------------------------------

create table if not exists public.inbox_views (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  -- { scope, filter, sort, query } â€” o estado da caixa no momento em que salvou
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inbox_views_location_idx
  on public.inbox_views (location_id, created_at);

alter table public.inbox_views enable row level security;
revoke all on public.inbox_views from anon;

drop policy if exists "membros leem inbox_views" on public.inbox_views;
create policy "membros leem inbox_views" on public.inbox_views
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam inbox_views" on public.inbox_views;
create policy "membros criam inbox_views" on public.inbox_views
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros editam inbox_views" on public.inbox_views;
create policy "membros editam inbox_views" on public.inbox_views
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem inbox_views" on public.inbox_views;
create policy "membros excluem inbox_views" on public.inbox_views
  for delete to authenticated
  using (location_id in (select private.user_locations()));


-- ------------------------------------------------------------
-- 0028_mensagens_agendadas.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Mensagens agendadas: log e disparo de verdade
--
-- AtÃ© aqui "Programar" sÃ³ gravava `messages.scheduled_for` e pintava o selo
-- AGENDADA. Nada disparava a mensagem na hora marcada e nÃ£o havia registro de
-- quem agendou. Estas colunas sÃ£o o log:
--   scheduled_by    â€” quem agendou
--   schedule_status â€” pendente â†’ enviando â†’ enviada | falhou | cancelada
--   dispatched_at   â€” quando saiu de verdade
--   schedule_error  â€” motivo, quando falhou
--
-- Quem dispara Ã© o batimento de minuto que jÃ¡ existe (/api/automations/tick,
-- pg_cron), entÃ£o nÃ£o hÃ¡ job, segredo nem env novos.
--
-- Idempotente.
-- ============================================================

alter table public.messages
  add column if not exists scheduled_by uuid references auth.users (id) on delete set null,
  add column if not exists schedule_status text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists schedule_error text;

alter table public.messages drop constraint if exists messages_schedule_status_chk;
alter table public.messages add constraint messages_schedule_status_chk
  check (
    schedule_status is null
    or schedule_status in ('pendente', 'enviando', 'enviada', 'falhou', 'cancelada')
  );

-- Agendamentos que jÃ¡ existiam entram no log como pendentes.
update public.messages
   set schedule_status = 'pendente'
 where scheduled_for is not null
   and schedule_status is null;

-- O disparador pergunta "o que venceu?" â€” sÃ³ as pendentes interessam.
create index if not exists messages_scheduled_pending_idx
  on public.messages (scheduled_for)
  where schedule_status = 'pendente';

-- O log lista por empresa, do mais recente para o mais antigo.
create index if not exists messages_scheduled_log_idx
  on public.messages (location_id, scheduled_for desc)
  where schedule_status is not null;


-- ------------------------------------------------------------
-- 0029_conversas_finalizar_arquivar.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversas: finalizar e arquivar
--
-- Dois eixos independentes de propÃ³sito, nÃ£o um status sÃ³:
--   finalizada = atendimento resolvido (some da caixa, mas Ã© histÃ³rico vivo)
--   arquivada  = tirada de vista (some da caixa, resolvida ou nÃ£o)
-- Guardar os dois separados permite responder "quantas finalizei este mÃªs?"
-- mesmo depois de arquivar, coisa que um enum Ãºnico apagaria.
--
-- Cada eixo guarda quem e quando, no mesmo espÃ­rito do log das agendadas (0028).
-- Reabrir/desarquivar = voltar a coluna para NULL.
--
-- Idempotente.
-- ============================================================

alter table public.conversations
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users (id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

-- A caixa padrÃ£o pergunta "o que estÃ¡ aberto?" â€” Ã­ndice parcial cobre o caso
-- comum sem carregar o resto.
create index if not exists conversations_abertas_idx
  on public.conversations (location_id, last_message_at desc)
  where closed_at is null and archived_at is null;

-- E as duas listas de consulta.
create index if not exists conversations_finalizadas_idx
  on public.conversations (location_id, closed_at desc)
  where closed_at is not null;

create index if not exists conversations_arquivadas_idx
  on public.conversations (location_id, archived_at desc)
  where archived_at is not null;


-- ------------------------------------------------------------
-- 0030_ai_agents.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Conversation AI: agentes (ai_agents)
--
-- Config de cada agente de IA por empresa: personalidade (system prompt), meta,
-- informaÃ§Ãµes, modelo, status, principal, canais e flags de aÃ§Ãµes. O "Testar seu bot"
-- monta o system prompt a partir daqui. PadrÃ£o multi-tenant: RLS membership, revoke
-- do anon. Idempotente. "Agente principal" Ã© garantido no app (setPrimary desmarca os outros).
-- ============================================================
set check_function_bodies = off;

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  personality text not null default '',       -- system prompt
  goal text not null default '',
  extra_info text not null default '',
  model text not null default 'gpt-4o-mini',
  status text not null default 'sugestivo' check (status in ('ativo', 'sugestivo', 'desativado')),
  is_primary boolean not null default false,
  channels text[] not null default '{}',
  actions jsonb not null default '{}',         -- { agendamento: true, ... }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_agents_location_idx on public.ai_agents (location_id, created_at desc);

alter table public.ai_agents enable row level security;
revoke all on public.ai_agents from anon;

drop policy if exists "membros leem ai_agents" on public.ai_agents;
create policy "membros leem ai_agents" on public.ai_agents
  for select to authenticated using (location_id in (select private.user_locations()));
drop policy if exists "membros criam ai_agents" on public.ai_agents;
create policy "membros criam ai_agents" on public.ai_agents
  for insert to authenticated with check (location_id in (select private.user_locations()));
drop policy if exists "membros editam ai_agents" on public.ai_agents;
create policy "membros editam ai_agents" on public.ai_agents
  for update to authenticated
  using (location_id in (select private.user_locations()))
  with check (location_id in (select private.user_locations()));
drop policy if exists "membros excluem ai_agents" on public.ai_agents;
create policy "membros excluem ai_agents" on public.ai_agents
  for delete to authenticated using (location_id in (select private.user_locations()));

drop trigger if exists ai_agents_updated_at on public.ai_agents;
create trigger ai_agents_updated_at before update on public.ai_agents
  for each row execute function private.set_updated_at();


-- ------------------------------------------------------------
-- 0031_whatsapp_template_tracking.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” Rastreio de entrega dos TEMPLATES de WhatsApp
--
-- template_name marca a mensagem como rastreÃ¡vel (sÃ³ envios de template).
-- delivered_at/read_at/failed_at guardam a linha do tempo carimbada pelo
-- webhook (status jÃ¡ existe desde a 0022); error_detail traz o motivo da
-- falha. Ãndice parcial para a aba de Logs. Idempotente. Sem novas policies:
-- a messages jÃ¡ tem RLS por membership.
-- ============================================================
set check_function_bodies = off;

alter table public.messages add column if not exists template_name text;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists failed_at timestamptz;
alter table public.messages add column if not exists error_detail text;

create index if not exists messages_template_name_idx
  on public.messages (location_id, created_at desc)
  where template_name is not null;


-- ------------------------------------------------------------
-- 0032_whatsapp_autoreply.sql
-- ------------------------------------------------------------
-- ============================================================
-- Lito CRM â€” WhatsApp auto-responder: flag de handoff humano
--
-- Quando um humano responde uma conversa pelo inbox (/api/whatsapp/send),
-- marcamos bot_paused=true e o auto-responder para de responder AQUELA conversa.
-- Nasce false. Idempotente.
-- ============================================================
alter table public.conversations
  add column if not exists bot_paused boolean not null default false;


