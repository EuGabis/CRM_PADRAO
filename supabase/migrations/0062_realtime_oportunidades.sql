-- ============================================================
-- CRM ON — Realtime das oportunidades.
--
-- Sem isso o card criado ou movido não chega ao navegador: a tela do
-- funil carrega uma vez e só atualiza com F5. Vale para o card que a IA
-- cria pelo WhatsApp e para o card que outro atendente arrasta.
--
-- `add table` NÃO é idempotente (erra se a tabela já estiver na
-- publicação), por isso o guard.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'opportunities'
  ) then
    alter publication supabase_realtime add table public.opportunities;
  end if;
end $$;
