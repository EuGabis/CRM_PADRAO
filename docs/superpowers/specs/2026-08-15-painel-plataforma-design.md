# Painel de plataforma

**Data:** 2026-08-15
**Status:** aprovado, pronto para plano de implementação

## Objetivo

O dono da plataforma cadastra empresas clientes já configuradas — limites, módulos
liberados e tipo de canal de WhatsApp — e suspende quem parar de pagar, **sem
ganhar acesso aos contatos e conversas de ninguém**.

## O que já existe

| Peça | Onde |
|---|---|
| Isolamento por empresa | `location_id` + RLS via `private.user_locations()` (`0001`) |
| Limites por empresa | `public.location_limits` (`0046`), escrita só por service role |
| Módulos liberados | `location_limits.disabled_modules`, com precedência sobre o admin do tenant |
| Limite de usuários e canais | triggers (`0047`, `0048`) |

Falta a camada **acima** dos tenants: hoje empresa nasce por auto-cadastro e os
limites se ajustam por SQL na mão.

## Decisões

1. **Primeiro acesso:** o dono define e-mail e senha do responsável e entrega. Não
   depende de e-mail configurado, serve para venda por telefone.
2. **Troca de senha obrigatória no primeiro login**, para a senha deixar de ser
   conhecida pelo dono assim que o cliente entra.
3. **O painel mostra cadastro + contadores**, nunca linhas de dados do cliente.
4. **Suspensão bloqueia o acesso e preserva os dados.**
5. **O tipo de canal de WhatsApp é gravado desde já** (`meta` | `evolution`), mesmo
   sem o não oficial existir. Hoje só armazena.

## Segurança — a parte que sustenta tudo

### Identidade do dono: `private.platform_admins`

```sql
create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
```

O schema `private` **não é exposto pelo PostgREST**: nenhum cliente lê, escreve ou
descobre que a tabela existe.

Não pode ser uma coluna em `public.profiles`: a `0001` cria a policy
`"editar o próprio perfil"`, então qualquer coluna ali é escrevível pelo dono da
linha — e um usuário se promoveria a dono da plataforma. É a mesma armadilha que
levou `location_limits` a virar tabela separada em vez de coluna em `locations`.

Helper, no padrão das funções existentes:

```sql
create or replace function private.is_platform_admin()
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (select 1 from private.platform_admins where user_id = (select auth.uid())) $$;
```

**O cadastro do primeiro dono é feito à mão, por SQL, uma única vez.** Fica de fora
do painel de propósito: quem cria dono de plataforma não pode ser o próprio painel.

### O que o dono passa a enxergar

Policies novas **apenas** em `public.locations` e `public.location_limits`
(select + insert + update, condicionadas a `private.is_platform_admin()`).

**Nenhuma policy nova em `contacts`, `conversations`, `messages`, `opportunities`.**
A RLS continua devolvendo vazio para o dono nessas tabelas — a garantia é do banco,
não da tela.

Contadores vêm de uma função que devolve só totais:

```sql
create or replace function private.platform_stats()
returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)
language sql security definer stable set search_path = ''
as $$ ... $$;
```

Ela verifica `private.is_platform_admin()` internamente e retorna `count(*)` por
empresa. O dono recebe o número; nunca ganha `select` nas tabelas.

### Suspensão: um ponto só

`public.locations` ganha `suspended_at timestamptz` e `suspended_reason text`.

A mudança acontece **dentro de `private.user_locations()`**, a função que toda
policy do sistema já consulta:

```sql
select m.location_id
  from public.location_members m
  join public.locations l on l.id = m.location_id
 where m.user_id = (select auth.uid())
   and l.suspended_at is null
```

Suspender remove a empresa do retorno da função, e o efeito propaga para todas as
tabelas de uma vez, sem tocar em policy nenhuma.

⚠️ **Consequência que precisa de tratamento explícito:** a própria policy de
`locations` é `id in (select private.user_locations())`. Suspensa, o cliente deixa de
ler até a própria empresa — e o app mostraria um CRM vazio e quebrado em vez de
explicar o motivo. Por isso:

```sql
create or replace function public.my_suspension()
returns table (suspended boolean, reason text)
language sql security definer stable set search_path = ''
as $$ ... $$;
```

`security definer`, então responde mesmo com a RLS bloqueando. O shell consulta na
entrada e mostra a tela de "empresa suspensa" com o motivo. Sem isso, todo cliente
suspenso vira um chamado de suporte.

⚠️ **Ela não aceita parâmetro.** Resolve a empresa do próprio chamador por
`location_members` + `auth.uid()`, ignorando só o filtro de suspensão. Uma versão que
recebesse `location_id` seria um furo: sendo `security definer`, qualquer cliente
consultaria o estado de qualquer empresa. Ela devolve exclusivamente o par
`(suspended, reason)` da empresa de quem chamou — nunca nome, nunca id, nunca linha
de outra empresa.

O dono continua vendo a empresa suspensa no painel, porque ele lê `locations` pela
policy de plataforma, não por `user_locations()`.

## Cadastro de empresa

`POST /api/plataforma/empresas`, autenticada e restrita a `is_platform_admin`,
usando service role. Recebe: nome da empresa, e-mail e senha do responsável,
`max_users`, `max_whatsapp_channels`, `disabled_modules`, `whatsapp_provider`.

Ordem das operações:

1. cria a empresa em `locations`
2. cria o usuário no Auth (admin API, `email_confirm: true`)
3. vincula como `admin` em `location_members`
4. grava `location_limits`
5. marca `profiles.must_change_password = true`

**Se qualquer passo falhar, desfaz o que já criou.** Sem isso sobra empresa sem dono
ou usuário sem empresa — exatamente o estado órfão que precisou ser consertado à mão
neste projeto em 2026-08-15, quando uma conta anterior ao trigger de onboarding
logava mas não tinha `location_id`.

O trigger `seed_location_limits` (`0046`) já cria uma linha de limites ao inserir a
empresa; o passo 4 é `update`, não `insert`.

Os triggers de limite (`0047`, `0048`) disparam no passo 3. Como `max_users` é
gravado só no passo 4, o primeiro membro nunca é barrado.

## Troca de senha no primeiro login

`public.profiles` ganha `must_change_password boolean not null default false`.

⚠️ A coluna vive numa tabela que o usuário edita (`"editar o próprio perfil"`), então
ele poderia marcar a própria coluna como `false` e pular a troca. **Impedir isso é
requisito**: um trigger `before update` em `profiles` rejeita a mudança dessa coluna
quando não vem da service role. O contorno é bobo — a pessoa só pularia uma tela —
mas o mesmo descuido em outra coluna não seria.

O shell de `(app)` redireciona para `/trocar-senha` enquanto a coluna for `true`.

## Tipo de canal de WhatsApp

`location_limits.whatsapp_provider text not null default 'meta'`, com
`check (whatsapp_provider in ('meta', 'evolution'))`.

Hoje **só armazena**. Nenhum código lê esse campo ainda — o WhatsApp não oficial não
existe no projeto (o módulo inteiro é Meta Cloud API, `whatsapp_channels` tem
`phone_number_id not null unique` e o cliente aponta para `graph.facebook.com` fixo).

Gravar desde já significa que, quando o não oficial for construído, as empresas
cadastradas antes já estão marcadas corretamente e a interface bifurca lendo este
campo.

## Telas

Rota `/plataforma`, **fora do grupo `(app)`**, com layout próprio — não aparece na
sidebar do CRM e não herda o shell do tenant.

A guarda é **server-side**: o layout é server component e consulta
`is_platform_admin` antes de renderizar. Guarda só no client seria contornável, e
aqui o que está do outro lado é a lista de todos os clientes.

- **Lista de empresas** — nome, responsável, criada em, plano (limites resumidos),
  contadores de `platform_stats()`, estado (ativa | suspensa).
- **Nova empresa** — o formulário do cadastro descrito acima.
- **Detalhe da empresa** — editar limites, módulos e `whatsapp_provider`; suspender
  e reativar.

## Fora de escopo

Cobrança e assinatura; entrar na conta do cliente para suporte; convite por e-mail no
cadastro de empresa (o dono entrega a senha); histórico de atividade e sinais de
churn; auto-cadastro de empresa (`signup_mode` continua `invite_only`); qualquer
implementação do WhatsApp não oficial além de gravar o campo.

## Riscos aceitos

- **O dono conhece a senha inicial do cliente.** Mitigado pela troca obrigatória no
  primeiro login, mas existe uma janela entre a criação e o primeiro acesso.
- **O primeiro dono de plataforma é cadastrado por SQL.** Não tem tela e não deve
  ter.
- **Contadores custam consultas agregadas** sobre as tabelas de todos os tenants. Com
  poucas empresas é irrelevante; se a lista ficar lenta, o caminho é materializar.
