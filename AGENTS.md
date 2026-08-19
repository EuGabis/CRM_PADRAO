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
- **Próximo número livre: `0062`.**
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

### Funil padrão de empresa nova

`private.prepare_client_company` (0053, ajustada na 0061) semeia cinco
etapas genéricas de venda no pipeline `✅ Controle de Leads` de toda
empresa nova: `Novo Lead`, `Proposta Enviada`, `Em Negociação`,
`Fechado/Ganho`, `Perdido`. Antes da 0061 o seed era o funil de SaaS do
próprio dono da plataforma (`TESTE GRÁTIS`, `ASSINOU`, `FILA DEMO`,
`CALL DEMO`, ...) — não fazia sentido para o cliente. Esses cinco nomes
são contrato: o atendimento natural por IA (Tasks 4 e 5) procura etapa
por este nome exato.

A 0061 só afeta empresa **nova**. Empresa existente não é tocada pela
migração — pode ter oportunidades nas etapas antigas, e reescrever em
massa apagaria trabalho de vendas em silêncio. Ajustar uma empresa
existente é manual: `supabase/manual/ajustar-funil-5-etapas.sql`, com
trava que recusa (`raise exception`) se houver oportunidade em etapa
que seria removida. Scripts em `supabase/manual/` não entram no
`gerar-setup.ps1`.

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

### WhatsApp não oficial (Evolution)

A empresa **escolhe o provedor** em `location_limits.whatsapp_provider`
(`'meta'` por padrão, ou `'evolution'`) — quem decide é o dono da plataforma
ao configurar o cliente, não o cliente sozinho, porque cada provedor tem
implicação de custo e suporte diferente.

`whatsapp_channels.provider` (`0057`) é quem de fato **bifurca envio e
recebimento** por canal: `meta` fala com a Cloud API oficial (número
verificado, janela de 24h, template); `evolution` é WhatsApp não oficial via
gateway próprio, conectado por QR code, sem essas regras. Um `check` na
`0057` impede canal pela metade: `meta` exige `phone_number_id`, `evolution`
exige `evolution_instance` — nunca os dois.

**Nunca toque em instância que o CRM não criou.** O gateway Evolution hospeda
instâncias de outros projetos do dono da plataforma. O nome da instância é
sempre `crmon-{channel_id}`, **derivado no servidor** a partir do id do canal
(`src/app/api/whatsapp/evolution/conectar/route.ts`) — nunca aceite nome de
instância vindo do cliente ou da UI.

`EVOLUTION_API_KEY` (`src/lib/evolution/client.ts`) é a chave **GLOBAL** do
gateway: com ela dá para listar, ler e apagar **qualquer** instância —
inclusive as de outros projetos que não são deste CRM. Trate como as chaves
mais sensíveis do `.env` — nunca logar, nunca expor em resposta de API,
nunca chamar o gateway fora de rota server-side.

`evolution_token` e `webhook_secret` são segredos por canal, no mesmo padrão
do `refresh_token` da `0023`: `select` de coluna revogado, nunca exposto ao
browser. Ver a armadilha do `revoke` de coluna abaixo antes de mexer em
segredo novo nessas tabelas.

**Mídia (imagem, áudio, vídeo, documento):** os limites de tamanho por tipo
ficam em `src/lib/whatsapp/media-limits.ts` (`LIMITES`, os mesmos tetos do
WhatsApp — aceitar acima disso seria guardar no Storage do dono da plataforma
um arquivo que o WhatsApp recusaria adiante). Documento é o tipo `file` no
banco — não existe `document` no `messages_type_check`.

No **envio**, o gateway baixa o arquivo por URL assinada (`sendMedia`/
`sendWhatsAppAudio` em `src/lib/evolution/client.ts` mandam a URL, não os
bytes). No **recebimento**, é o inverso: os bytes passam pela nossa função
(`baixarMidia`, mesmo arquivo) e sobem para o bucket `conversation-media`.

No recebimento, o webhook (`evolution/webhook/route.ts`) classifica a mídia
pelo **envelope** da mensagem (`imageMessage`, `audioMessage`,
`videoMessage`, `documentMessage`), **nunca pelo `mimetype`**: um documento
sondado chegou com `mimetype: image/jpeg` (foto mandada "como documento") —
classificar por mime perderia o `fileName`, que só o envelope de documento
carrega (os outros três tipos não trazem nome de arquivo; o nome é
sintetizado como `${tipo}.${ext}`). `tipoPorMime` só vale no caminho de
envio, onde não existe envelope, só o mime que o composer informa. O
`fileLength` do payload da Evolution vem como objeto protobuf
(`{low, high, unsigned}`), nunca compare direto com o limite — sempre passe
por `bytesDoPayload`.

Mensagem com mídia que falha (limite estourado, download ou upload com erro)
**é gravada mesmo assim**, com corpo rotulado (ex.: `[imagem não disponível]`)
e sem as colunas de mídia — perder a mensagem do cliente é pior que mostrá-la
incompleta. O webhook sempre responde 200, mesmo nesses casos.

**Envio de texto (`src/lib/whatsapp/enviar.ts`):** todo envio **automático** de
texto do CRM — agendadas (`src/lib/messages/scheduled.ts`) e auto-resposta
(`src/lib/whatsapp/auto-reply.ts`) — passa por `enviarTexto`, o helper único
que bifurca Meta/Evolution por `channel.provider`. É a única forma de garantir
que os dois caminhos automáticos não divirjam na próxima regra nova. A rota
**interativa** (`api/whatsapp/send/route.ts`) ainda bifurca por conta própria,
porque carrega regras que só valem para ela (janela de 24h e template do
canal Meta) — ao mudar regra de envio, mexa nos dois.

**Auto-resposta funciona nos dois provedores.** `maybeAutoReply` não sabe (nem
precisa saber) qual é o provedor do canal — quem decide a entrega é o
`enviarTexto` que ela chama no fim. O que muda entre Meta e Evolution na
GERAÇÃO é só o gatilho: no canal **Evolution** a IA dispara para texto, áudio,
imagem, vídeo e documento; no canal **Meta** ela dispara **só para texto** —
áudio e foto recebidos pela Cloud API não acionam a IA (o webhook da Meta só
chama `maybeAutoReply` no caminho de `m.text?.body`).

A ordem das guardas em `maybeAutoReply` (chave OpenAI → módulo `whatsapp` →
módulo `agentes-ia` → empresa suspensa → canal entregável → `bot_paused` →
agente ativo → limite diário) **é proteção de custo, não estética**: cada
guarda está antes do ponto em que a chamada gastaria `OPENAI_API_KEY` ou a
credencial global do provedor de WhatsApp — a mais barata de checar vem
primeiro, a mídia (que é o que de fato paga Whisper/Vision) só é processada
depois de todas elas passarem. Adicionar uma guarda nova: decida a posição
pelo custo que ela evita, não pelo fim da lista.

**Os dois módulos são exigidos**, com motivos de log distintos: `whatsapp`
cobre a credencial global do gateway e `agentes-ia` cobre a `OPENAI_API_KEY`
(é o mesmo módulo que `api/ai/chat` exige). Desde a `0056`, `whatsapp` nasce
liberado e `agentes-ia` nasce bloqueado — exigir só o primeiro deixava a IA
respondendo justamente na combinação em que o dono acha que a desligou.

**O canal é checado dentro de `maybeAutoReply`**, antes da mídia e do chat —
não só no `enviarTexto`. Checar só na entrega significa pagar Whisper, visão e
chat para descobrir depois que o canal está caído; e o limite diário não
segura o prejuízo, porque ele conta saídas **gravadas** e envio que falha não
grava, então o contador nunca sobe. Canal Evolution/Baileys cai sozinho com
frequência.

**Modelo da OpenAI passa por allowlist no servidor** (`MODELOS_PERMITIDOS` em
`src/lib/ai/openai.ts`): `ai_agents.model` é um campo de texto livre que o
cliente digita, e quem paga é o dono da plataforma. Modelo fora da lista cai
no `defaultModel()` em vez de recusar a resposta. Validar na tela não serve —
a API pode ser chamada direto. Só modelos baratos entram na lista.

**Tetos de áudio:** 5 minutos (`TETO_AUDIO_SEGUNDOS`) e 8 MB
(`TETO_AUDIO_BYTES`) em `auto-reply.ts`. O que esse teto economiza é o
**Whisper, não a banda**: quando `maybeAutoReply` roda, o webhook já baixou o
arquivo do gateway e já subiu para o Storage. O teto em bytes tem que ficar
**abaixo** do limite de recebimento de áudio (16 MB em `media-limits.ts`),
senão vira código morto — era o caso dos 20 MB anteriores. Sem teto, um áudio
longo de um cliente final vira custo aberto (Whisper) na conta do dono da
plataforma. O histórico mandado ao modelo também é truncado (2.000 caracteres
por mensagem) e a resposta tem `max_tokens`: uma mensagem de WhatsApp vai a 65
mil caracteres.

**Trava da imagem** (`TRAVA_IMAGEM`, texto verbatim da Task 6, não alterar) é
acrescentada ao **fim** do `system`, depois da personalidade/objetivo/
informações que o cliente configura para o agente — nunca antes. É nessa
ordem porque uma personalidade mais assertiva escrita pelo cliente poderia
atropelar uma instrução que viesse primeiro. Sem a trava no fim, o caso
clássico e caro: cliente manda comprovante de PIX, a IA "lê" a imagem e
responde "pagamento confirmado" sem checar nada — o erro cai no cliente do
dono da plataforma.

A trava entra para **qualquer mídia** de entrada, não só quando há imagem
enviada ao modelo. Amarrá-la à imagem deixava de fora os casos mais caros: o
comprovante mandado "como documento" (chega como `documentMessage` com
`mimetype: image/jpeg` e vira tipo `file`), o comprovante narrado em áudio e a
imagem cuja URL assinada falhou — em todos, o pedido de confirmação está no
**texto**, e é o texto que o modelo confirma.

**Vídeo e documento não são interpretados** pela IA: o agente só reconhece o
recebimento (`[vídeo recebido]` / `[documento recebido]`) e o bot **não
pausa** — pausar deixaria a conversa muda depois de um único anexo. (Despausar
existe desde a Task 8: botão "IA pausada / Reativar IA" no cabeçalho da
conversa, em `components/inbox/thread.tsx`.) O rótulo é **concatenado** à
legenda do cliente, nunca no lugar dela: substituir transformava "segue o
comprovante, pode liberar?" em `[documento recebido]` e escondia do modelo
justamente o pedido que a trava precisa recusar.

**Envelopes do Baileys** (`evolution/webhook/route.ts`) são tratados em três
grupos, e a distinção importa:

1. **Ignorados sem gravar nada** (`ENVELOPES_IGNORADOS`): `albumMessage`,
   `protocolMessage`, `reactionMessage`, `senderKeyDistributionMessage`,
   `pollUpdateMessage`, `pinInChatMessage`, `keepInChatMessage`. Gravá-los
   enchia o inbox de lixo, incrementava não lidas, sobrescrevia a prévia e
   **reabria conversa fechada** (o update zera `closed_at`/`archived_at`). O
   descarte só acontece quando não há conteúdo real junto no mesmo payload.
2. **Desembrulhados** (`ENVELOPES_TRANSPARENTES`, recursivo):
   `ephemeralMessage`, `viewOnceMessage`, `viewOnceMessageV2`,
   `viewOnceMessageV2Extension`, `editedMessage`. `ephemeralMessage` é o mais
   grave — quem usa mensagens temporárias tem **todo** o conteúdo embrulhado
   nele, então texto e mídia desse cliente sumiam e a IA nunca disparava.
3. **Rótulo em português** para o resto (`ROTULOS_ENVELOPE`): `[figurinha]`,
   `[localização]`, `[contato]`, `[enquete]`… em vez do nome cru do envelope.
   Continuam sendo gravados e **nunca** acionam a IA — `ehTextoReal` segue
   `false` para todos.

`key.fromMe` só conta como "recebida" quando é explicitamente `false` (ou a
string `"false"`). Testar apenas `undefined` furava a proteção anti-laço: a
serialização protobuf→JSON emite `null` com frequência, e `null` entrava como
mensagem de cliente — a IA respondia ao próprio eco, gastando as duas chaves
globais.

**Janela de 24h e templates são só do canal Meta.** São regras da Cloud API
oficial (número verificado, WABA) — canal Evolution não tem número verificado
nem templates aprovados, então nem a checagem de janela nem a opção de
template se aplicam a ele. `dispatchScheduledMessages` só aplica a janela
quando `channel.provider !== "evolution"`; o composer e o disparo em lote
escondem o atalho de template quando o canal da conversa é Evolution, em vez
de deixar montar um template que o gateway devolveria como "Mensagem vazia".
O **limite diário** do canal, ao contrário, vale nos dois provedores — é regra
de produto (proteger o cliente de mandar demais num dia), não regra de
provedor.

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
9. **`revoke select (coluna)` no Postgres NÃO subtrai de um `grant select`
   de TABELA.** Ele emite `WARNING: no privileges could be revoked` e não faz
   nada. Como a `0055` concede `select` em todas as tabelas do schema para
   `authenticated`, os revokes de coluna da `0055` e da `0057` eram no-op —
   `evolution_token`, `webhook_secret` e `google_ads_connections.refresh_token`
   ficaram legíveis pelo browser. A correção está na `0058`: revoga o `select`
   da TABELA inteira e concede de volta a lista explícita de colunas
   não-secretas. Ao criar coluna secreta nova, siga o padrão da `0058`, nunca
   o padrão antigo (`revoke select (coluna)` sozinho). Consequência prática:
   nessas tabelas **`select("*")` não funciona mais** pela sessão do usuário —
   sempre lista explícita de colunas. Segredo que uma rota autenticada
   precise usar se busca à parte com `createAdminClient()`, escopado por um
   id que a RLS já validou (ver `api/whatsapp/send/route.ts` e
   `api/google-ads/overview/route.ts`).

## Convenções

- Todo texto de UI em **pt-BR**; moeda via `formatBRL`.
- Nome do produto só via `lib/config/brand.ts` — nunca hardcodar.
- Ação que ainda não tem backend: `toast.info("<ação> chega com o backend")`.
- Estilo: h1 `text-lg font-bold text-slate-900`; cards `rounded-xl border bg-white`;
  tabelas `text-xs`; botões `h-8 text-xs`; primário indigo (#6366f1); sidebar
  grafite (tokens `--crm-*` em `globals.css`).
- Commits em português: `feat(modulo): descrição`.
