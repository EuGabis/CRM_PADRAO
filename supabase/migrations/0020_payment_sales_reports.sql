-- ============================================================
-- Lito CRM — Pagamentos: relatórios com o histórico completo
--
-- Vendas e Relatórios calculavam receita/gráficos a partir do array em
-- memória do store (`usePaymentEvents`), que só carrega as 100 vendas mais
-- recentes (limite pensado pra a tabela da aba Vendas, não pra agregações).
-- Com o histórico completo sincronizado (milhares de vendas desde 2024), os
-- últimos 6 meses sozinhos já passam de 100 vendas — receita, ticket médio
-- e produtos que mais faturam ficavam bem abaixo do que a própria Guru
-- mostra no Resumo Diário.
--
-- payment_sales_monthly agrega no Postgres (mês x produto), então mesmo com
-- milhares de vendas o resultado que volta pro client é só "meses x
-- produtos distintos" — pequeno, rápido de somar em memória, sempre exato.
--
-- Mesmo vocabulário de status "aprovado" das views de contatos (migração
-- 0016) — se classifyGuruStatus() mudar essa categoria, atualizar aqui.
--
-- Idempotente (create or replace / create index if not exists).
-- ============================================================

create index if not exists payment_events_location_created_idx
  on public.payment_events (location_id, guru_created_at);

-- Agrega por status (não só "aprovado") pra cobrir também reembolsos e
-- chargebacks nos KPIs — o client classifica com classifyGuruStatus(),
-- igual já fazia com o array em memória.
create or replace view public.payment_sales_monthly
with (security_invoker = on) as
select
  location_id,
  date_trunc('month', guru_created_at) as month,
  coalesce(nullif(trim(product_name), ''), 'Sem produto') as product_name,
  count(*)::int as sales_count,
  coalesce(sum(amount), 0)::numeric as revenue,
  status
from public.payment_events
where guru_created_at is not null
group by location_id, date_trunc('month', guru_created_at), coalesce(nullif(trim(product_name), ''), 'Sem produto'), status;

grant select on public.payment_sales_monthly to authenticated;
revoke all on public.payment_sales_monthly from anon;
