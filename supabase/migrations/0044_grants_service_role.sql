-- ============================================================
-- 0044 — privilégios do service_role no schema public
--
-- POR QUE ISTO EXISTE
--
-- Nenhuma migração anterior concede privilégio ao `service_role`: a 0001
-- apenas REVOGA do `anon` e, no projeto Supabase original, o resto vinha
-- dos default privileges daquele projeto. Num projeto novo esse default
-- não veio junto, e o Postgres responde:
--
--   42501  permission denied for table contacts
--   hint:  GRANT SELECT ON public.contacts TO service_role;
--
-- Consequência sem esta migração: tudo que usa `src/lib/supabase/admin.ts`
-- falha com 403 — motor de automações, motor de e-mail marketing, webhook
-- do WhatsApp e sincronização da Guru. E falha em silêncio, porque essas
-- rotas são máquina-a-máquina e ninguém está olhando a tela.
--
-- SEGURANÇA
--
-- Isto NÃO afrouxa a RLS para usuários. `service_role` só é alcançável com
-- a chave secreta (`sb_secret_...`), que vive apenas no servidor e nunca
-- tem prefixo NEXT_PUBLIC_. Ignorar a RLS é exatamente a função dela.
-- O `anon` continua revogado; esta migração não toca nele.
-- ============================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Vale também para o que for criado daqui pra frente, senão toda tabela
-- nova volta a dar 42501 e o erro reaparece meses depois, longe da causa.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;

-- Reforça a intenção da 0001: o `anon` não enxerga nada do schema public.
-- Idempotente e barato; protege contra uma tabela nova ter nascido com
-- grant para anon vindo de default privilege.
revoke all on all tables in schema public from anon;
