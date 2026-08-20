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
-- Roda tudo numa transação (o SQL Editor executa o script inteiro como uma só)
-- — se qualquer passo falhar, nada é aplicado.

-- ── 1a. Funde CONTATOS duplicados por (location_id, phone) ──────────────────
-- Sobrevivente = o mais antigo (o original; as duplicatas são ecos posteriores).
-- `id` como desempate determinístico.
drop table if exists _contact_merge;
create temporary table _contact_merge as
select c.id as loser_id, k.keeper_id
from public.contacts c
join (
  select
    location_id,
    phone,
    (array_agg(id order by created_at asc, id asc))[1] as keeper_id
  from public.contacts
  where phone <> ''
  group by location_id, phone
  having count(*) > 1
) k on c.location_id = k.location_id and c.phone = k.phone
where c.id <> k.keeper_id;

-- Remapeia todas as tabelas que apontam para contacts.id.
update public.opportunities        t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.conversations        t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.appointments         t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.tasks                t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.automation_runs      t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.form_submissions     t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.contact_notes        t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;
update public.contact_files        t set contact_id = m.keeper_id from _contact_merge m where t.contact_id = m.loser_id;

-- email_campaign_recipients tem unique(campaign_id, contact_id): só remapeia
-- quando o sobrevivente ainda não é destinatário daquela campanha; o resto é
-- descartado (seria o mesmo contato na mesma campanha).
update public.email_campaign_recipients t
   set contact_id = m.keeper_id
  from _contact_merge m
 where t.contact_id = m.loser_id
   and not exists (
     select 1 from public.email_campaign_recipients r2
      where r2.campaign_id = t.campaign_id and r2.contact_id = m.keeper_id
   );
delete from public.email_campaign_recipients t using _contact_merge m where t.contact_id = m.loser_id;

-- Contatos perdedores já sem referências: apaga.
delete from public.contacts c using _contact_merge m where c.id = m.loser_id;

-- ── 1b. Funde CONVERSAS duplicadas por (location_id, contact_id, channel) ───
-- Precisa vir DEPOIS de 1a: ao remapear conversations.contact_id para o contato
-- sobrevivente, duas conversas antes distintas podem ter colidido na mesma
-- (location, contato, canal).
drop table if exists _conversation_merge;
create temporary table _conversation_merge as
select v.id as loser_id, k.keeper_id
from public.conversations v
join (
  select
    location_id,
    contact_id,
    channel,
    (array_agg(id order by created_at asc, id asc))[1] as keeper_id
  from public.conversations
  group by location_id, contact_id, channel
  having count(*) > 1
) k
  on v.location_id = k.location_id
 and v.contact_id  = k.contact_id
 and v.channel     = k.channel
where v.id <> k.keeper_id;

-- Mensagens são a única tabela que aponta para conversations.id.
update public.messages t set conversation_id = m.keeper_id
  from _conversation_merge m where t.conversation_id = m.loser_id;

-- Atualiza a prévia/última-mensagem e não-lidas do sobrevivente a partir do
-- conjunto fundido, para o inbox não ficar com dado obsoleto.
update public.conversations v
   set last_message_at = agg.last_at,
       last_message_preview = coalesce(agg.last_preview, v.last_message_preview),
       unread_count = agg.unread_sum
  from (
    select m.keeper_id,
           max(x.last_message_at) as last_at,
           sum(coalesce(x.unread_count, 0)) as unread_sum,
           (array_agg(x.last_message_preview order by x.last_message_at desc nulls last))[1] as last_preview
      from _conversation_merge m
      join public.conversations x on x.id in (m.keeper_id, m.loser_id)
     group by m.keeper_id
  ) agg
 where v.id = agg.keeper_id;

delete from public.conversations v using _conversation_merge m where v.id = m.loser_id;

drop table if exists _contact_merge;
drop table if exists _conversation_merge;

-- ── 2. Travas únicas que impedem novas duplicatas ──────────────────────────
-- Contato: um telefone por empresa (ignora phone vazio — contato só de e-mail).
create unique index if not exists contacts_location_phone_uniq
  on public.contacts (location_id, phone)
  where phone <> '';

-- Conversa: uma por (empresa, contato, canal).
create unique index if not exists conversations_location_contact_channel_uniq
  on public.conversations (location_id, contact_id, channel);
