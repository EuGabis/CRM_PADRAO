-- ============================================================
-- CRM ON — Contatos: telefone/documento na visão de valores
--
-- migração 0016 criou payment_contacts/payment_contacts_summary (compras,
-- total gasto, assinaturas ativas) agregando payment_events + payment_
-- subscriptions. migração 0018 trouxe o cadastro real da Guru (telefone,
-- CPF) em payment_guru_contacts, mas numa aba separada — perdendo os
-- valores. Aqui as duas se juntam: payment_contacts passa a expor
-- phone/doc também, casando por e-mail com payment_guru_contacts, para a
-- aba Contatos voltar a mostrar compras/total gasto/assinaturas E permitir
-- busca por telefone/CPF na mesma tabela.
--
-- Índices por lower(contact_email)/lower(email) — o join e o filtro de
-- busca (.or() ilike) rodam a cada tecla digitada; sem eles a agregação
-- fica lenta conforme o histórico cresce.
--
-- Idempotente (create or replace / create index if not exists).
-- ============================================================

create index if not exists payment_events_location_email_idx
  on public.payment_events (location_id, lower(contact_email));
create index if not exists payment_subscriptions_location_email_idx
  on public.payment_subscriptions (location_id, lower(contact_email));
create index if not exists payment_guru_contacts_email_idx
  on public.payment_guru_contacts (location_id, lower(email));

create or replace view public.payment_contacts
with (security_invoker = on) as
with base as (
  select
    e.location_id,
    coalesce(nullif(lower(trim(e.contact_email)), ''), lower(trim(e.contact_name))) as contact_key,
    e.contact_name,
    e.contact_email,
    g.phone,
    g.doc,
    case
      when lower(e.status) = any (array['approved','completed','trial','started','transferred'])
      then e.amount
    end as approved_amount,
    case
      when lower(e.status) = any (array['approved','completed','trial','started','transferred'])
      then 1 else 0
    end as approved_sale,
    0 as active_sub,
    e.guru_created_at as activity_at
  from public.payment_events e
  left join public.payment_guru_contacts g
    on g.location_id = e.location_id
   and e.contact_email is not null and e.contact_email <> ''
   and lower(trim(g.email)) = lower(trim(e.contact_email))
  union all
  select
    s.location_id,
    coalesce(nullif(lower(trim(s.contact_email)), ''), lower(trim(s.contact_name))) as contact_key,
    s.contact_name,
    s.contact_email,
    g.phone,
    g.doc,
    null::numeric,
    0,
    case
      when lower(s.status) = any (array['active','started','trial'])
      then 1 else 0
    end,
    s.guru_updated_at
  from public.payment_subscriptions s
  left join public.payment_guru_contacts g
    on g.location_id = s.location_id
   and s.contact_email is not null and s.contact_email <> ''
   and lower(trim(g.email)) = lower(trim(s.contact_email))
)
select
  location_id,
  contact_key,
  (array_agg(contact_name  order by contact_name)  filter (where contact_name  is not null))[1] as name,
  (array_agg(contact_email order by contact_email) filter (where contact_email is not null))[1] as email,
  coalesce(sum(approved_sale), 0)::int      as purchases,
  coalesce(sum(approved_amount), 0)::numeric as total_spent,
  coalesce(sum(active_sub), 0)::int          as active_subs,
  max(activity_at)                           as last_activity,
  (array_agg(phone order by phone) filter (where phone is not null))[1] as phone,
  (array_agg(doc   order by doc)   filter (where doc   is not null))[1] as doc
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
