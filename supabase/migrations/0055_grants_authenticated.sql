-- ============================================================
-- 0055 — privilégios do `authenticated` no schema public
--
-- POR QUE ISTO EXISTE
--
-- Mesmo buraco que a 0044 consertou para o `service_role`, e pela mesma
-- causa: num projeto Supabase novo os privilégios padrão de tabela não vêm,
-- e nenhuma migração deste projeto os concede — a 0001 só REVOGA do `anon`.
-- A 0044 corrigiu o `service_role` e parou aí; o `authenticated` ficou com
-- zero privilégio em todas as tabelas.
--
-- Sintoma: o usuário loga, o servidor o reconhece, e toda consulta feita
-- pelo navegador falha com `42501 permission denied for table <x>`. As telas
-- que não tratam erro mostram vazio, então parece "não tenho dados" em vez
-- de "não tenho permissão" — foi assim que passou despercebido até a tela
-- de plataforma, a primeira que exibe o erro em vez de fingir lista vazia.
--
-- RLS NÃO SUBSTITUI GRANT. São duas camadas: o GRANT decide se o papel pode
-- tocar na tabela, a RLS decide QUAIS LINHAS ele vê. Sem o GRANT, a RLS nem
-- chega a ser avaliada.
--
-- SEGURANÇA
--
-- Concede as quatro operações que a RLS filtra (select, insert, update,
-- delete) e NÃO concede `truncate`, `references` nem `trigger`. O `truncate`
-- em especial IGNORA a RLS: com ele, um usuário logado apagaria a tabela
-- inteira de todas as empresas de uma vez. O padrão do Supabase é conceder
-- `all`; aqui é de propósito mais estreito, e nada no app precisa do resto.
--
-- O `anon` continua sem nada — esta migração não o toca.
-- ============================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on all tables in schema public to authenticated;

-- Sequências: necessárias para colunas com default de sequência.
grant usage, select on all sequences in schema public to authenticated;

-- Vale para o que for criado daqui pra frente, senão toda tabela nova
-- reabre o mesmo buraco e o erro reaparece longe da causa.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ------------------------------------------------------------
-- Restaura as restrições de coluna que o grant amplo acima desfez.
--
-- A 0023 revoga a leitura de `refresh_token` (token de longa duração do
-- Google Ads) de anon e authenticated de propósito: só a service role lê.
-- Um `grant` no nível da tabela reconcede a coluna junto, então o revoke
-- precisa ser reaplicado DEPOIS. Sem isto, esta migração reabre em silêncio
-- um segredo que a 0023 fechou.
--
-- Ao acrescentar qualquer `revoke` de coluna no futuro, repita-o aqui.
-- ------------------------------------------------------------
revoke select (refresh_token) on public.google_ads_connections from anon, authenticated;

-- ------------------------------------------------------------
-- VIEWS: nenhuma é escrita pelo cliente, e uma delas é perigosa.
--
-- `grant ... on all tables` alcança views. A `payment_integration_status`
-- (0036) é SECURITY DEFINER de propósito — existe para o membro comum ver o
-- ESTADO da integração sem furar a RLS admin-only de `payment_credentials`.
-- Ela é auto-atualizável (um FROM simples), então com INSERT/UPDATE/DELETE
-- passaria a escrever na tabela base com os privilégios do DONO da view,
-- sem a RLS ser avaliada. Um membro não-admin apagaria a credencial da Guru,
-- ou moveria a linha (com api_key e webhook_token) para outra empresa via
-- `update ... set location_id = ...` — a view não tem WITH CHECK OPTION.
--
-- As outras três são `security_invoker = on` e portanto seguras, mas também
-- não são escritas por ninguém; revogar deixa a intenção explícita.
-- ------------------------------------------------------------
revoke insert, update, delete on
  public.payment_integration_status,
  public.payment_contacts,
  public.payment_contacts_summary,
  public.payment_sales_monthly
from authenticated;

-- ------------------------------------------------------------
-- Tabelas que o cliente só LÊ — restaura o estreitamento que o grant amplo
-- desfez.
--
-- A RLS já bloqueia (deny-by-default, sem policy de escrita), então isto é
-- defesa em profundidade: mantém a proteção em DUAS camadas. Sem ele, uma
-- policy de escrita criada por engano no futuro passaria a valer sozinha —
-- e no caso de `location_limits` isso significaria o cliente definindo o
-- próprio plano, que é exatamente o que a 0046 existe para impedir.
--
-- `automation_runs` mantém DELETE: limpar o histórico é ação legítima do
-- cliente e tem policy própria desde a 0007.
-- ------------------------------------------------------------
revoke insert, update, delete on
  public.location_limits,
  public.payment_events,
  public.automation_logs,
  public.email_campaign_recipients
from authenticated;

revoke insert, update on public.automation_runs from authenticated;

-- Reforça a intenção da 0001: `anon` não enxerga nada do schema public.
revoke all on all tables in schema public from anon;
