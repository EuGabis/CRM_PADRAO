<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# CRM — guia do projeto

CRM all-in-one em Next.js. O código veio de um projeto anterior (`crm-2.0`) como
ponto de partida; **este repositório é a base nova e independente** — o histórico
antigo é referência, não autoridade.

## Nosso processo

- **Origin:** `github.com/EuGabis/CRM_PADRAO`, branch `main`. Só `main` — não
  trouxemos os branches do projeto antigo.
- **Padrão de trabalho:** commit + push na `main` a cada mudança concluída.
  Terminar com `git status` limpo.
- **Não há deploy ligado.** Este repo não está conectado a nenhum projeto Vercel,
  então push **não** publica nada. Se um dia ligar, anote aqui.
- Antes de dizer que algo funciona: `npm run build` tem que passar. Ele faz o
  type check junto.

## Como rodar

```bash
npm install
npm run dev
```

Sobe em `http://localhost:3000` e redireciona para `/dashboard`.

⚠️ **Falta o `.env.local`** — sem ele nada que toca o banco funciona (a tela de
login quebra logo de cara). O modelo está em `.env.example`. Precisa de Supabase
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) no mínimo; Resend, Guru, WhatsApp, Google Ads e
OpenAI só fazem falta nos módulos correspondentes. **Nunca commitar `.env.local`;**
ao criar variável nova, adicionar também no `.env.example` com placeholder.

## Stack (versões reais do `package.json`)

Next.js **16.3.0** (App Router) · React **19.2.8** · TypeScript · Tailwind CSS **4**
· **shadcn/ui na variante Base UI (`@base-ui/react`) — NÃO Radix** · Zustand ·
dnd-kit (kanban) · Recharts · date-fns · lucide-react · sonner · Tiptap (editor do
Marketing) · Supabase (`@supabase/ssr`) · Resend · svix.

## Estrutura

```
src/
  proxy.ts             # middleware do Next 16 (renomeado); protege as rotas via getUser()
  app/(app)/           # 19 módulos, 1 pasta = 1 item da sidebar
  app/api/             # ai · automations · forms · google-ads · integrations
                       # marketing · team · webhooks · whatsapp
  components/
    layout/            # Sidebar, Topbar, painéis do shell
    shared/            # DataTable, KpiCard, EmptyState, ...
    ui/                # shadcn (Base UI)
    <dominio>/         # dashboard, inbox, contacts, pipeline, marketing, ...
  lib/
    config/brand.ts    # ÚNICA fonte do nome/marca — nunca hardcodar
    config/nav.ts      # itens da sidebar
    data/types.ts      # Contact, Conversation, Opportunity, Pipeline, ...
    data/fixtures/     # dados mock pt-BR
    data/store.ts      # store Zustand dos mocks
    data/repos/        # ⚠️ ver abaixo — mock e real convivem
    supabase/          # client (browser) · server · admin (service role)
supabase/migrations/   # SQL aplicado à mão no SQL Editor
docs/superpowers/      # specs e planos do projeto anterior — referência histórica
```

## Dados: mock e real convivem (leia antes de mexer em tela)

Esta é a parte que mais confunde. Existem **duas camadas de repositório**:

- `src/lib/data/repos/db/*.ts` — **real**, fala com o Supabase. 20 arquivos
  (contacts, pipeline, conversations, appointments, team, payments, whatsapp,
  campaigns, ai, ai-agents, forms, google-ads, dashboards, account, activation, ...).
- `src/lib/data/repos/*.ts` (raiz) — **mock**, lê do store Zustand com fixtures.
  Restam 5: `contacts`, `conversations`, `opportunities`, `appointments`, `workflows`.

**Uma tela migrada ainda importa do arquivo mock** — mas só helpers puros
(`contactName`, `formatBRL`). Os dados vêm do `db/`. Exemplo em `contatos/page.tsx`:

```ts
import { contactName } from "@/lib/data/repos/contacts";      // helper — ok
import { useDbContacts } from "@/lib/data/repos/db/contacts"; // dados — real
```

O sinal de que a tela **ainda é mock** é importar os *hooks de dados* da raiz
(`useContacts`, `useOpportunities`, `useWorkflows`, ...). Hoje isso acontece em:

| Tela | O que ainda é mock |
|---|---|
| `reputacao` | tudo (`useContacts`) |
| `automacoes` | `useWorkflows` — a lista de automações |
| `relatorios` | `useContacts`, `useOpportunities`, `useUsers` |
| `assinaturas` | `useContacts` (o resto vem do repo real de pagamentos) |
| `pagamentos` | `useContacts` (idem) |

Ao migrar um módulo: crie/estenda o repo em `db/`, troque os hooks de dados na
tela e deixe os helpers como estão.

## Banco (Supabase) e migrações

Schema multi-tenant: **toda tabela de domínio tem `location_id`**, RLS
deny-by-default, políticas `TO authenticated` checando membership. `admin.ts`
(service role) só em rota server-side sem sessão de usuário (cron, webhooks).

- Migrações em `supabase/migrations/000N_nome.sql`, aplicadas **à mão no SQL Editor**.
- Sempre **idempotentes** (`create ... if not exists`, `drop policy if exists`).
- **Próximo número livre: `0050`.**
- ⚠️ **Há números duplicados no histórico** — `0014`, `0015`, `0016` e `0019`
  aparecem duas vezes cada (colisão de trabalho paralelo no projeto anterior).
  Não dá pra confiar no número como ordem real; confira o conteúdo. **Não repita
  isso:** confira o maior número antes de criar.
- Várias migrações **recriam políticas de migrações anteriores** (ex.: as de
  `conversations`/`messages`). Ao mexer numa policy, verifique se outra migração
  posterior já a redefiniu, e preserve todas as condições existentes.

### Instalar num projeto Supabase novo

**`supabase/setup/`** tem as migrações concatenadas em 4 partes, na ordem
cronológica real (a numérica está errada). Procedimento completo em
`supabase/setup/README.md`. Os três pontos que travam quem não leu:

1. **Habilitar `pg_cron` antes** — nenhuma migração cria extensão; sem isso a
   parte 01 quebra no fim.
2. **O cadastro nasce fechado** (`0006`, `invite_only`) e num banco zerado não há
   quem te convide. Abra com `update private.app_settings set signup_mode = 'open';`,
   crie sua conta, feche de novo.
3. **Três migrações de cron ficaram de fora** (`0009`, `0011`, `0014_guru_sync_config`,
   mais o fim do `0013`): elas agendam `pg_cron` chamando uma URL pública que ainda
   não temos — o placeholder `https://SEU-DOMINIO` precisa ser trocado pelo domínio
   real antes de aplicá-las. Consequência: automações, campanhas e mensagens
   agendadas não disparam sozinhas até lá.

Ao criar migração nova, registre-a em `scripts/gerar-setup.ps1` e rode o script —
ele falha de propósito se alguma migração ficar sem classificar.

### Planos e limites por empresa

`public.location_limits` guarda o limite de cada empresa: `max_users`,
`max_whatsapp_channels` (`null` = ilimitado) e `disabled_modules` (lista de
BLOQUEIO — módulo novo nasce liberado para todos).

Fica **fora** da `locations` porque aquela tabela é editável pelo admin do
próprio tenant; aqui não existe policy de escrita para `authenticated`, só a
service role escreve. Não crie uma: seria o cliente definindo o próprio plano.

Os limites numéricos são aplicados por trigger (`0047`, `0048`), não na tela —
o admin do cliente chama a API direto. O limite de módulo tem precedência
**sobre o admin** em `canAccess`, senão ele se autoriza sozinho.

Empresa nova nasce com `ai-studio`, `agentes-ia`, `marketing` e `whatsapp`
bloqueados: essas features consomem `OPENAI_API_KEY`, `RESEND_API_KEY` e
`WHATSAPP_TOKEN`, que são **globais** — o consumo de todo cliente cai na conta
do dono da plataforma. Liberar um módulo é assumir esse custo.

Ajustar um cliente:

```sql
update public.location_limits
   set max_users = 5,
       disabled_modules = '{ai-studio}',
       notes = 'Plano combinado em <data>',
       updated_at = now()
 where location_id = '<uuid>';
```

`assertModuleEnabled` (`src/lib/plan/guard.ts`) falha FECHADO: se a consulta a
`location_limits` der `error` (RLS mudada, erro transitório, coluna renomeada),
ele recusa o módulo em vez de liberar, para não deixar o consumo cair na conta
do dono da plataforma em silêncio. Isso só foi possível depois que as migrações
`0046`–`0049` foram aplicadas no banco; antes disso o helper falhava aberto de
propósito. Não reverta para `data?.disabled_modules ?? []` sem checar `error`.

## Armadilhas verificadas neste código

1. **Base UI ≠ Radix.** `PopoverTrigger`/`DropdownMenuTrigger`/`TooltipTrigger`
   **não** aceitam `asChild`. Use `render={<Button ... />}`, com os children fora
   do `render` (ver `components/layout/topbar.tsx:83`).
2. **`SelectValue` não resolve o label a partir do value** — passe children
   explícito: `<SelectValue>{label}</SelectValue>`. `onValueChange` recebe
   `string | null`.
3. **`Accordion` (Base UI)** não tem prop `type`; só `defaultValue={[...]}`.
4. **Zustand: nunca filtrar/mapear dentro do selector.**
   `useCrmStore(s => s.x.filter(...))` cria array novo a cada render = loop
   infinito. Selecione o array cru e derive com `useMemo`.
5. **`lucide-react` não tem ícones de marca** (Facebook/Instagram) — o
   `ChannelIcon` usa badge de texto para essas redes.
6. Páginas são client components (`"use client"`) — não dá pra passar ícone
   Lucide de Server para Client component como prop.
7. **A chave secreta do Supabase é `sb_secret_...`, não a JWT `service_role`.**
   Este projeto usa o sistema de chaves novo; a JWT antiga ainda passa na API de
   Auth mas o PostgREST a trata como `anon`, então `admin.ts` deixa de furar a
   RLS **em silêncio**. E o `service_role` só tem privilégio por causa da `0044` —
   se aparecer `42501 permission denied`, é ela que faltou.
8. **`src/proxy.ts` protege tudo por padrão.** Rota máquina-a-máquina (cron,
   webhook, embed público) precisa sair do `matcher` **e** validar a própria
   credencial — senão o middleware responde 307 para `/login`. Já estão fora:
   `api/automations`, `api/whatsapp`, `api/forms`, `api/webhooks`,
   `api/integrations`, `api/marketing`.

## Convenções

- Todo texto de UI em **pt-BR**; moeda via `formatBRL`.
- Nome do produto só via `lib/config/brand.ts` — nunca hardcodar.
- Ação que ainda não tem backend: `toast.info("<ação> chega com o backend")`.
- Estilo: h1 `text-lg font-bold text-slate-900`; cards `rounded-xl border bg-white`;
  tabelas `text-xs`; botões `h-8 text-xs`; primário indigo (#6366f1); sidebar
  grafite (tokens `--crm-*` em `globals.css`).
- Commits em português: `feat(modulo): descrição`.
