# SaaS multi-empresa: planos e limites por empresa

**Data:** 2026-08-15
**Status:** aprovado, pronto para plano de implementação

## Objetivo

Permitir que outras empresas usem o CRM ON, cada uma isolada na sua, com limites
de uso definidos por empresa e controlados só pelo dono da plataforma.

## O que já existe (não refazer)

O schema nasceu multi-tenant na migração `0001`. Antes de projetar qualquer coisa,
o levantamento mostrou que a maior parte do pedido já está construída:

| Capacidade | Onde |
|---|---|
| Isolamento de dados por empresa | `location_id` em toda tabela de domínio + RLS via `private.user_locations()` |
| Cadastro self-service criando empresa própria | `private.handle_new_user()` — sem convite pendente, cria `location`, torna o usuário `admin` e semeia pipeline de 9 fases |
| Nome da empresa no cadastro | o form de `/login` já coleta e envia em `raw_user_meta_data.company` |
| Cliente convida o próprio time | Configurações → Equipe (`0004`) |
| Departamentos e permissão por módulo | `0033`, resolvidos por `canAccess` em `db/team.ts` |

**Só falta ligar o cadastro** (`private.app_settings.signup_mode = 'open'`) e
acrescentar a camada de limites. Não há trabalho de isolamento a fazer.

## Decisões

1. **Escopo:** apenas planos e limites. Ficam de fora painel de plataforma,
   cobrança/assinatura e acesso à conta do cliente para suporte.
2. **Limites moram na empresa**, não numa tabela de planos. Cada empresa carrega
   seus próprios números; negociação é caso a caso.
3. **Limites aplicados:** número de usuários, número de canais de WhatsApp e quais
   módulos ficam liberados. Teto de contatos foi descartado de propósito: a
   importação de CSV em massa esbarraria nele e quebraria o onboarding do cliente.
4. **Empresa nova nasce com tudo liberado, menos os módulos caros.**
5. **Quem edita limites é o dono da plataforma, via SQL.** Sem tela — não há
   painel de plataforma neste escopo.

## O problema que definiu o desenho

`public.locations` tem esta política, vinda da `0001`:

```sql
create policy "admin edita location" on public.locations
  for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));
```

Qualquer coluna de limite guardada em `locations` seria escrevível pelo admin de
qualquer empresa cliente: `update locations set max_users = 9999` pela API, sem
precisar de botão na tela. Daí a tabela separada.

## Modelo de dados

Migração **`0046_location_limits.sql`**.

```sql
create table public.location_limits (
  location_id            uuid primary key references public.locations (id) on delete cascade,
  max_users              int,
  max_whatsapp_channels  int,
  disabled_modules       text[] not null default '{}',
  notes                  text,
  updated_at             timestamptz not null default now()
);
```

- `max_users` / `max_whatsapp_channels`: `null` significa **ilimitado**. Zero é um
  valor válido e diferente de `null` (bloqueia tudo).
- `disabled_modules`: chaves de `lib/config/nav.ts`.
- `notes`: por que este cliente tem este limite. Sem tela de plataforma, é aqui que
  fica o registro da negociação.

**RLS:** membro da empresa faz `select` (a UI precisa saber o próprio limite para
explicar o bloqueio). **Nenhum papel `authenticated` escreve** — sem policy de
insert/update/delete. Só a `service_role`, ou seja, você pelo SQL Editor.

### Lista de bloqueio, não de liberação

`disabled_modules` guarda o que está **fechado**. Com lista de liberação, todo
módulo novo do produto nasceria invisível para todas as empresas existentes até
alguém lembrar de liberar uma por uma. Com lista de bloqueio, módulo novo já
chega liberado — que é a regra escolhida ("tudo liberado por padrão").

### Padrão da empresa nova

Trigger `after insert on public.locations`, **aditivo** (função própria, sem
reescrever `private.on_location_created` da `0033` — mesmo padrão que a `0033`
usou para não mexer no `handle_new_user`):

```sql
disabled_modules = '{ai-studio, agentes-ia, marketing, whatsapp}'
max_users = null
max_whatsapp_channels = null
```

Os outros 14 módulos vêm liberados.

**Por que esses quatro:** as credenciais de OpenAI, Resend e Meta são variáveis de
ambiente **globais**, compartilhadas por todas as empresas
(`lib/ai/openai.ts:14`, `lib/whatsapp/client.ts:13`, `lib/marketing/engine.ts:43`).
Consumo de IA de qualquer cliente cai na conta OpenAI do dono da plataforma;
campanha de qualquer cliente sai do domínio Resend do dono e queima a reputação
de entrega dele. Com cadastro aberto e sem esse padrão, um cadastro anônimo
apontando um agente de IA em loop vira fatura sem teto.

Isso é contenção, não isolamento: quando o módulo é liberado, o custo continua
sendo do dono da plataforma. Isolar de verdade exige credencial por empresa, que
está fora deste escopo.

## Aplicação dos limites

Regra geral: **no banco, por trigger.** Esconder controle na tela não basta — o
admin do cliente tem sessão válida e chama a API direto. O projeto já aprendeu
isso na `0040`, onde esconder o botão de excluir conversa não impedia o delete.

| Limite | Onde barra |
|---|---|
| Usuários | trigger `before insert` em `location_members` **e** em `invitations` |
| Canais de WhatsApp | trigger `before insert` em `whatsapp_channels` |
| Módulos | `canAccess` + guarda de rota + checagem nas rotas de API |

**Por que o limite de usuários barra também no convite:** validar só na entrada do
membro deixaria o admin criar convites à vontade, e a falha apareceria para o
convidado, no meio do cadastro dele — erro na cara da pessoa errada.

Contagem de usuários = linhas em `location_members` + convites **pendentes**.
Ignorar convites pendentes permitiria estourar o limite disparando vários convites
antes de qualquer um ser aceito.

### Módulos: a checagem entra acima do admin

`canAccess` (`db/team.ts:61`) resolve hoje nesta ordem:

```
admin vê tudo → exceção individual → departamento → libera
```

O limite de plano entra **antes de tudo**:

```
plano bloqueou? → não → admin vê tudo → exceção individual → departamento → libera
```

Sem essa precedência o admin do cliente se dá permissão sozinho e usa o módulo
que não foi liberado.

### Guarda de rota (lacuna existente)

Hoje `can()` só filtra a lista da sidebar (`components/layout/sidebar.tsx:83`).
**Não existe guarda de rota:** digitar `/marketing` na URL renderiza a página
mesmo sem permissão. Isso já vale para as permissões de departamento de hoje e
inviabilizaria o limite de plano.

O layout de `(app)` passa a barrar módulo sem acesso, mostrando por que está
bloqueado — separando "seu plano não inclui" de "seu departamento não tem acesso",
porque a ação do usuário é diferente em cada caso (falar com o fornecedor vs.
falar com o próprio admin).

A guarda de rota é UX, não segurança: o que protege de verdade são os triggers e
as checagens nas rotas de API. Rota de IA e de marketing recusam no servidor,
mesmo que a tela seja contornada.

## Operação

Ajustar um cliente:

```sql
update public.location_limits
   set max_users = 5,
       disabled_modules = '{ai-studio}',
       notes = 'Plano combinado em 2026-08-20, R$ X/mes',
       updated_at = now()
 where location_id = '<uuid>';
```

Abrir o cadastro público:

```sql
update private.app_settings set signup_mode = 'open';
```

## Fora de escopo

Painel de plataforma; cobrança e assinatura; entrar na conta do cliente para
suporte; teto de contatos; credenciais de OpenAI/Meta/Resend por empresa; cota de
consumo (X mensagens de IA/mês).

## Riscos aceitos

- **Custo das chaves globais.** Módulo liberado = consumo na conta do dono da
  plataforma, sem teto. Mitigado apenas pelo padrão de nascer desligado.
- **Sem painel, limite se ajusta por SQL.** Aceitável enquanto o número de
  clientes for pequeno; vira gargalo quando crescer.
- **Cadastro aberto permite cadastro anônimo.** Empresas vazias vão se acumular no
  banco. Sem impacto de custo (os módulos caros nascem desligados), mas sem
  faxina automática.
