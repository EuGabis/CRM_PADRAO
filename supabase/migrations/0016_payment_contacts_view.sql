-- ============================================================
-- Lito CRM — Pagamentos: agregação de contatos (histórico completo)
--
-- A aba Contatos precisa mostrar TODOS os compradores, não só os que
-- couberam nas últimas 100 vendas carregadas no client. Em vez de puxar
-- tudo pro navegador, agregamos no banco por contato (chave = e-mail, ou
-- nome quando não há e-mail) e a UI pagina como o painel da Guru.
--
-- Duas views SECURITY INVOKER (a RLS das tabelas base — payment_events e
-- payment_subscriptions, ambas com policy de leitura por membership —
-- continua valendo, sem vazar dados de outra empresa):
--   * payment_contacts          — uma linha por contato
--   * payment_contacts_summary  — totais por empresa (pros KPIs)
--
-- O conjunto de status "aprovado" espelha classifyGuruStatus() em
-- src/lib/data/guru.ts (categoria "aprovado"). Se aquele vocabulário mudar,
-- atualizar os arrays abaixo junto.
--
-- Idempotente (create or replace).
-- ============================================================

-- statuses de VENDA que contam como aprovada (categoria "aprovado" no TS)
--   approved, completed, trial, started, transferred
-- statuses de ASSINATURA ativa (categoria "aprovado" no TS)
--   active, started, trial

create or replace view public.payment_contacts
with (security_invoker = on) as
with base as (
  select
    location_id,
    coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))) as contact_key,
    contact_name,
    contact_email,
    case
      when lower(status) = any (array['approved','completed','trial','started','transferred'])
      then amount
    end as approved_amount,
    case
      when lower(status) = any (array['approved','completed','trial','started','transferred'])
      then 1 else 0
    end as approved_sale,
    0 as active_sub,
    guru_created_at as activity_at
  from public.payment_events
  union all
  select
    location_id,
    coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))) as contact_key,
    contact_name,
    contact_email,
    null::numeric,
    0,
    case
      when lower(status) = any (array['active','started','trial'])
      then 1 else 0
    end,
    guru_updated_at
  from public.payment_subscriptions
)
select
  location_id,
  contact_key,
  (array_agg(contact_name  order by contact_name)  filter (where contact_name  is not null))[1] as name,
  (array_agg(contact_email order by contact_email) filter (where contact_email is not null))[1] as email,
  coalesce(sum(approved_sale), 0)::int      as purchases,
  coalesce(sum(approved_amount), 0)::numeric as total_spent,
  coalesce(sum(active_sub), 0)::int          as active_subs,
  max(activity_at)                           as last_activity
from base
where contact_key is not null and contact_key <> ''
group by location_id, contact_key;

grant select on public.payment_contacts to authenticated;
revoke all on public.payment_contacts from anon;

create or replace view public.payment_contacts_summary
with (security_invoker = on) as
select
  location_id,
  count(*)::int                                  as contacts,
  coalesce(sum(total_spent), 0)::numeric         as revenue,
  count(*) filter (where active_subs > 0)::int   as with_subs
from public.payment_contacts
group by location_id;

grant select on public.payment_contacts_summary to authenticated;
revoke all on public.payment_contacts_summary from anon;
