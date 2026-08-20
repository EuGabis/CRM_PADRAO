-- 0064: elimina duplicatas de contato/conversa e cria as travas únicas que
-- faltavam.
--
-- CAUSA DA DUPLICAÇÃO: os webhooks de WhatsApp (Evolution e Meta) faziam
-- "SELECT contato -> se não existe, INSERT" e "SELECT conversa -> se não
-- existe, INSERT", sem nenhuma constraint única por trás. O Baileys/Evolution
-- entrega mensagens em rajada e a Meta reentrega; cada evento é uma invocação
-- concorrente da função. Dois eventos do mesmo contato novo chegando juntos
-- fazem os dois SELECTs voltarem vazios e os dois INSERTs passarem -> contato
-- e conversa duplicados. `messages` nunca duplicou porque tem índice único em
-- `wa_message_id` (0022); `contacts` e `conversations` não tinham trava
-- nenhuma.
--
-- Esta migração faz as duas coisas, na ordem certa e de forma idempotente:
--   1. funde as duplicatas já existentes (remapeando todas as tabelas filhas);
--   2. cria os índices únicos que impedem novas duplicatas.
-- Sem o passo 1 os índices do passo 2 falhariam ao serem criados.
--
-- IMPORTANTE: cada statement é autossuficiente (recalcula o mapa
-- perdedor->sobrevivente por CTE). NÃO usa tabela temporária de propósito — o
-- SQL Editor do Supabase roda via pooler em modo transação, onde cada statement
-- pode cair numa conexão diferente e uma temp table (escopo de sessão) some
-- entre um statement e o próximo ("relation _... does not exist").
-- O mapa é estável entre os statements porque os contatos/conversas perdedores
-- só são APAGADOS no fim de cada fase.

-- ── 1a. Funde CONTATOS duplicados por (location_id, phone) ──────────────────
-- Sobrevivente = o mais antigo (o original; as duplicatas são ecos posteriores),
-- `id` como desempate determinístico. Remapeia todas as tabelas que apontam
-- para contacts.id.

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.opportunities t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.conversations t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.appointments t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.tasks t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.automation_runs t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.form_submissions t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.contact_notes t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.contact_files t set contact_id = m.keeper
  from m where t.contact_id = m.loser;

-- email_campaign_recipients tem unique(campaign_id, contact_id): só remapeia
-- quando o sobrevivente ainda não é destinatário daquela campanha; o resto é
-- descartado logo em seguida (seria o mesmo contato na mesma campanha).
with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.email_campaign_recipients t set contact_id = m.keeper
  from m
 where t.contact_id = m.loser
   and not exists (
     select 1 from public.email_campaign_recipients r2
      where r2.campaign_id = t.campaign_id and r2.contact_id = m.keeper
   );

with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
delete from public.email_campaign_recipients t using m where t.contact_id = m.loser;

-- Contatos perdedores já sem referências: apaga.
with ranked as (
  select id, location_id, phone,
         first_value(id) over (
           partition by location_id, phone order by created_at asc, id asc
         ) as keeper
  from public.contacts
  where phone <> ''
), m as (select id as loser, keeper from ranked where id <> keeper)
delete from public.contacts c using m where c.id = m.loser;

-- ── 1b. Funde CONVERSAS duplicadas por (location_id, contact_id, channel) ───
-- Precisa vir DEPOIS de 1a: ao remapear conversations.contact_id para o contato
-- sobrevivente, duas conversas antes distintas podem ter colidido na mesma
-- (location, contato, canal). `messages` é a única tabela que aponta para
-- conversations.id. A prévia/não-lidas do sobrevivente se autocorrigem na
-- próxima mensagem recebida — não vale o risco de um merge mais elaborado.

with ranked as (
  select id, location_id, contact_id, channel,
         first_value(id) over (
           partition by location_id, contact_id, channel order by created_at asc, id asc
         ) as keeper
  from public.conversations
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.messages t set conversation_id = m.keeper
  from m where t.conversation_id = m.loser;

with ranked as (
  select id, location_id, contact_id, channel,
         first_value(id) over (
           partition by location_id, contact_id, channel order by created_at asc, id asc
         ) as keeper
  from public.conversations
), m as (select id as loser, keeper from ranked where id <> keeper)
delete from public.conversations v using m where v.id = m.loser;

-- ── 2. Travas únicas que impedem novas duplicatas ──────────────────────────
-- Contato: um telefone por empresa (ignora phone vazio — contato só de e-mail).
create unique index if not exists contacts_location_phone_uniq
  on public.contacts (location_id, phone)
  where phone <> '';

-- Conversa: uma por (empresa, contato, canal).
create unique index if not exists conversations_location_contact_channel_uniq
  on public.conversations (location_id, contact_id, channel);
