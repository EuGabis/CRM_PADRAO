-- ============================================================
-- Lito CRM — Contatos: índices para a busca por valor ficar rápida
--
-- payment_contacts (migração 0016/0019) agrega payment_events +
-- payment_subscriptions por contact_key com array_agg/group by. Buscar por
-- nome/e-mail/telefone/documento nessa view filtra DEPOIS da agregação —
-- Postgres precisa computar o group by inteiro (23k+ vendas, 2.4k
-- assinaturas) antes de aplicar o ILIKE. Medido: ~680ms por tecla digitada.
--
-- payment_guru_contacts (migração 0018) já tem índices simples em
-- name/phone/doc e é 90x mais rápido pra busca (~7ms) — vira a fonte
-- principal de listagem/busca. payment_contacts (compras/total gasto/
-- assinaturas/última atividade) passa a ser só um enriquecimento pontual
-- da página visível (≤20 contatos), filtrando por contact_key = ANY(...).
-- Esse filtro é por igualdade numa coluna de agrupamento — o planner
-- consegue empurrar pra dentro do scan das tabelas base, mas sem um índice
-- que bata exatamente com a expressão do contact_key ainda cai em Seq Scan
-- (medido ~106ms pra 5 chaves). Os índices funcionais abaixo resolvem isso.
--
-- Idempotente (create index if not exists).
-- ============================================================

create index if not exists payment_events_contact_key_idx
  on public.payment_events (
    location_id,
    (coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))))
  );

create index if not exists payment_subscriptions_contact_key_idx
  on public.payment_subscriptions (
    location_id,
    (coalesce(nullif(lower(trim(contact_email)), ''), lower(trim(contact_name))))
  );
