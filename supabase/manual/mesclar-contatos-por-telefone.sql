-- MANUAL: mescla contatos que são a MESMA pessoa gravada em formatos de
-- telefone diferentes (ex.: "55 11 97400-7817" formatado pelo cadastro manual
-- vs "5511974007817" cru do webhook do WhatsApp; e o 9º dígito do celular que o
-- WhatsApp às vezes omite).
--
-- A migração 0064 só junta telefone IDÊNTICO. Este script junta pela CHAVE
-- NORMALIZADA (só dígitos, sem o código de país 55 e sem o 9 extra de celular),
-- então precisa de REVISÃO HUMANA antes de rodar — dois números realmente
-- distintos poderiam, em tese, normalizar igual. Rode a query de detecção antes
-- e confira que cada grupo é mesmo a mesma pessoa.
--
-- Sobrevivente do grupo: prefere o contato com telefone SÓ DÍGITOS (o do
-- webhook — é o formato que as próximas mensagens do WhatsApp vão casar),
-- depois o mais antigo, `id` como desempate.
--
-- Cada statement é autossuficiente. A normalização vive numa FUNÇÃO permanente
-- (`private.norm_phone`), não numa temp table — o SQL Editor do Supabase roda
-- via pooler em modo transação e uma temp table não sobrevive entre statements.
-- A função é criada no começo e removida no fim.
--
-- NÃO entra no gerar-setup.ps1 (scripts de supabase/manual/ ficam de fora).

-- ── Função de normalização ─────────────────────────────────────────────────
-- só dígitos -> tira "55" do país -> tira o 9 extra de celular (11 -> 10 díg).
create or replace function private.norm_phone(p text)
returns text language sql immutable as $$
  select case when length(d2) = 11 then left(d2, 2) || substr(d2, 4) else d2 end
  from (
    select case when length(d) >= 12 and left(d, 2) = '55' then substr(d, 3) else d end as d2
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) a
  ) b;
$$;

-- ── Derruba a trava única de conversa DURANTE o merge ───────────────────────
-- A 0064 já criou `conversations_location_contact_channel_uniq`. No Fase 1, ao
-- mover a conversa do perdedor para o sobrevivente (que já tem uma conversa de
-- WhatsApp), o UPDATE viola a trava na hora — antes do Fase 2 conseguir fundir.
-- Derruba aqui e recria no fim, depois do Fase 2 já ter deduplicado as conversas.
drop index if exists public.conversations_location_contact_channel_uniq;

-- ── Fase 1: remapeia as tabelas filhas do perdedor para o sobrevivente ──────
-- Bloco de mapa reutilizado (perdedor -> sobrevivente), por chave normalizada:
--   select id as loser, first_value(id) over (
--     partition by location_id, private.norm_phone(phone)
--     order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
--   from public.contacts where phone <> ''

update public.opportunities t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.conversations t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.appointments t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.tasks t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.automation_runs t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.form_submissions t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.contact_notes t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

update public.contact_files t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

-- email_campaign_recipients tem unique(campaign_id, contact_id): só remapeia
-- quando o sobrevivente ainda não é destinatário daquela campanha; o resto é
-- descartado em seguida.
update public.email_campaign_recipients t set contact_id = mm.keeper from (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm
 where t.contact_id = mm.loser and mm.loser <> mm.keeper
   and not exists (
     select 1 from public.email_campaign_recipients r2
      where r2.campaign_id = t.campaign_id and r2.contact_id = mm.keeper);

delete from public.email_campaign_recipients t using (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where t.contact_id = mm.loser and mm.loser <> mm.keeper;

-- Contatos perdedores já sem referências: apaga.
delete from public.contacts c using (
  select id as loser, first_value(id) over (
    partition by location_id, private.norm_phone(phone)
    order by (phone ~ '^[0-9]+$') desc, created_at asc, id asc) as keeper
  from public.contacts where phone <> ''
) mm where c.id = mm.loser and mm.loser <> mm.keeper;

-- ── Fase 2: funde CONVERSAS que colidiram após o remapeamento ───────────────
-- Depois de mover conversations.contact_id para o sobrevivente, duas conversas
-- antes distintas podem ter virado a mesma (location, contato, canal). Chave
-- EXATA agora — o contato já foi unificado. `messages` é a única filha.
with ranked as (
  select id, location_id, contact_id, channel,
         first_value(id) over (
           partition by location_id, contact_id, channel order by created_at asc, id asc
         ) as keeper
  from public.conversations
), m as (select id as loser, keeper from ranked where id <> keeper)
update public.messages t set conversation_id = m.keeper from m where t.conversation_id = m.loser;

with ranked as (
  select id, location_id, contact_id, channel,
         first_value(id) over (
           partition by location_id, contact_id, channel order by created_at asc, id asc
         ) as keeper
  from public.conversations
), m as (select id as loser, keeper from ranked where id <> keeper)
delete from public.conversations v using m where v.id = m.loser;

-- ── Recria a trava única de conversa ────────────────────────────────────────
-- Conversas já deduplicadas no Fase 2, então a recriação não colide.
create unique index if not exists conversations_location_contact_channel_uniq
  on public.conversations (location_id, contact_id, channel);

-- ── Limpeza ─────────────────────────────────────────────────────────────────
drop function if exists private.norm_phone(text);
