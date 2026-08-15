-- ============================================================
-- 0045 — remove a marca antiga de dentro do banco
--
-- Renomear no código não muda o que já foi gravado no Postgres. Três coisas
-- ficaram para trás e esta migração corrige as duas primeiras; a terceira
-- exige rodar a 0033 de novo (ver nota no fim).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Job do pg_cron
--
-- A 0007 agendou 'lito-aniversarios'. Renomear a string no arquivo não
-- renomeia o job já criado: reaplicar a 0007 apenas criaria um SEGUNDO job
-- com o nome novo, e os dois passariam a enfileirar aniversários — cada
-- contato receberia a automação duas vezes por dia.
-- ------------------------------------------------------------
select cron.unschedule('lito-aniversarios')
where exists (select 1 from cron.job where jobname = 'lito-aniversarios');

select cron.unschedule('crm-aniversarios')
where exists (select 1 from cron.job where jobname = 'crm-aniversarios');

select cron.schedule('crm-aniversarios', '0 12 * * *', $$select private.enqueue_birthdays()$$);

-- Os jobs de tick/sync nunca chegaram a ser criados aqui (as migrações de cron
-- ficaram de fora do setup), mas o unschedule é barato e torna esta migração
-- segura em um banco que já os tenha.
select cron.unschedule('lito-automation-tick')
where exists (select 1 from cron.job where jobname = 'lito-automation-tick');
select cron.unschedule('lito-marketing-tick')
where exists (select 1 from cron.job where jobname = 'lito-marketing-tick');
select cron.unschedule('lito-guru-sync')
where exists (select 1 from cron.job where jobname = 'lito-guru-sync');

-- ------------------------------------------------------------
-- 2. Remetente padrão das campanhas
--
-- A 0010 criou email_campaigns.from_email com DEFAULT apontando para um
-- domínio de terceiro. Toda campanha nova nascia assinando aquele domínio;
-- o Resend recusaria (domínio não verificado nesta conta) e o erro apareceria
-- só na hora do disparo. Quem manda é a env EMAIL_FROM.
-- ------------------------------------------------------------
alter table public.email_campaigns
  alter column from_email set default '';

-- Limpa o que já nasceu com o default antigo. Rascunhos apenas: campanha já
-- enviada fica como está, para o histórico não mentir sobre o que saiu.
update public.email_campaigns
   set from_email = ''
 where from_email like '%litoaviation.com%'
   and status in ('draft', 'rascunho', 'paused');

-- ------------------------------------------------------------
-- 3. NOTA — mojibake na descrição dos departamentos
--
-- O gerador de supabase/setup/ lia os arquivos como ANSI e gravava UTF-8,
-- então os acentos das partes 02–04 chegaram corrompidos ao banco. O caso com
-- dado real é a descrição do departamento Comercial, na 0033, que vive dentro
-- do corpo de uma função e só apareceria ao criar a primeira empresa.
--
-- O gerador já foi corrigido. Para consertar o que está gravado, rode de novo:
--
--   supabase/migrations/0033_departamentos.sql
--
-- Ela é idempotente e redefine a função com o texto certo. Não dá para fazer
-- isso aqui sem duplicar o corpo inteiro da função.
-- ------------------------------------------------------------
