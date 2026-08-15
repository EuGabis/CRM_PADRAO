# Setup do banco — instalação num projeto Supabase novo

Estes 4 arquivos são as migrações de `supabase/migrations/` concatenadas na **ordem
cronológica real** de aplicação, prontas pra colar no SQL Editor.

Por que não usar a pasta `migrations/` direto: os números **têm duplicatas** —
`0014`, `0015`, `0016` e `0019` aparecem duas vezes cada, e o `0008` foi escrito
depois do `0009`–`0011`. Ordenar por nome aplica na ordem errada. A ordem aqui veio
da data do commit que criou cada arquivo.

> Regerar depois de adicionar migrações novas: o script está em
> `scripts/gerar-setup.ps1`. Ele falha de propósito se alguma migração não estiver
> classificada em nenhuma parte.

## Passo a passo

### 0. Habilitar `pg_cron` — ANTES de tudo

**Nenhuma migração cria as extensões.** No projeto antigo elas foram ligadas à mão
pelo painel.

Supabase → **Database** → **Extensions** → habilite **`pg_cron`**.

Pular este passo já mordeu uma vez: a `0007` termina com
`cron.schedule('lito-aniversarios', ...)`. Sem a extensão, essa linha falha, e como
o SQL Editor roda tudo em transação **a migração inteira volta atrás** — sem erro
visível se você não leu a saída até o fim. O sintoma é `automation_runs` e
`automation_logs` não existirem depois de você jurar que rodou a `0007`.

(`pg_net` só faz falta pra sincronização automática da Guru e para o motor de
automações, que estão de fora deste setup — ver "O que ficou de fora".)

### 1. Rodar as 4 partes, em ordem

No SQL Editor, uma de cada vez, esperando terminar antes da próxima:

| Ordem | Arquivo | O que instala |
|---|---|---|
| 1º | `01_fundacao.sql` | Schema base multi-tenant, RLS, contatos, pipelines, conversas, equipe/permissões, checklist, automações |
| 2º | `02_marketing_pagamentos.sql` | E-mail marketing e integração Guru (vendas, assinaturas, relatórios) |
| 3º | `03_conversas_whatsapp_ia.sql` | Mídia nas conversas, WhatsApp, Google Ads, formulários, IA |
| 4º | `04_departamentos_painel_agenda.sql` | Departamentos, logo, painéis personalizados, segmentação de pipelines, agenda, **grants do `service_role`** |

A parte 04 termina com a `0044`, que concede os privilégios do `service_role` em
`all tables in schema public` — por isso ela roda por último, quando todas as
tabelas já existem. Sem ela, tudo que usa `admin.ts` (automações, marketing,
webhook do WhatsApp, sync da Guru) responde `42501 permission denied`.

As migrações são idempotentes (`if not exists`, `drop policy if exists`), então
rodar de novo não quebra.

### 2. Destravar o cadastro pra criar a PRIMEIRA conta

A migração `0006` fecha o cadastro: **só entra quem tem convite pendente**, e o
trigger de signup aborta a transação — nem chamando a API de auth direto a conta é
criada. Num banco novo não existe ninguém pra te convidar, então você fica trancado
do lado de fora.

Abra o cadastro, crie a sua conta em `/login`, e feche de novo:

```sql
-- antes de criar sua conta
update private.app_settings set signup_mode = 'open';
```

Crie a conta na tela de cadastro. Depois:

```sql
-- assim que sua conta existir
update private.app_settings set signup_mode = 'invite_only';
```

O trigger de onboarding cria sozinho o perfil, a empresa (`location`) e um pipeline
padrão com 9 fases. Daí em diante todo mundo entra por convite, em
Configurações → Equipe.

### 3. Conferir

```sql
-- deve listar as tabelas do CRM
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- RLS tem que estar ligada em todas
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

A segunda consulta **tem que voltar vazia**. Qualquer tabela aí é dado exposto.

## O que ficou de fora (de propósito)

Três migrações não entraram porque agendam `pg_cron` chamando
**`https://lito-crm.vercel.app`** — a produção do projeto antigo. Aplicadas aqui,
nosso banco passaria a bater na aplicação de outra pessoa a cada minuto:

| Migração | O que faz |
|---|---|
| `0009_automation_cron.sql` | Job que chama `/api/automations/tick` (motor de automações **e** disparo das mensagens agendadas) |
| `0011_marketing_cron.sql` | Job que chama `/api/marketing/tick` (envio das campanhas) |
| `0014_guru_sync_config.sql` | Config + job da sincronização da Guru |

O fim do `0013` também foi cortado pelo mesmo motivo (as colunas dele entraram; só
o `cron.schedule` saiu).

**Consequência prática:** automações, campanhas de e-mail e mensagens agendadas
ficam sem motor — o código existe e as tabelas também, mas nada dispara sozinho.
Isso não é perda: sem deploy público, o Supabase não teria como alcançar um
`localhost` mesmo.

**Quando tivermos uma URL pública**, aplicar as três trocando a URL pela nossa e o
placeholder `COLE_O_AUTOMATION_SECRET_AQUI` pelo `AUTOMATION_SECRET` do
`.env.local` — os dois lados têm que bater, senão o tick responde 401.

## Diagnóstico

```sql
-- jobs agendados
select jobname, schedule, active from cron.job;

-- o que o cron recebeu de resposta (deve ser 200)
select status_code, created from net._http_response order by created desc limit 5;
```
