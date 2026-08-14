# WhatsApp — Criação de Templates + Rastreio de Entrega (só templates)

**Data:** 2026-08-14
**Módulo:** WhatsApp (`/whatsapp`)
**Status:** Aprovado (brainstorming)

## Contexto

Hoje o módulo WhatsApp só **lista** templates já aprovados da Meta
(`GET /api/whatsapp/templates` → `listTemplates(waba_id)` com filtro
`status=APPROVED`). Não há criação, exclusão nem acompanhamento de status de
revisão. Também não existe visão de rastreio de entrega dos envios.

A tabela `messages` (migração `0022_whatsapp.sql`) já tem `wa_message_id`,
`status` (`sent/delivered/read/failed`), `channel_id` e `replica identity full`
(status ao vivo via Realtime). O webhook (`/api/whatsapp/webhook`) já atualiza
`messages.status` nos eventos `statuses` da Meta — mas sobrescreve cego (pode
rebaixar `read` → `delivered`) e não guarda horários nem motivo de falha.

A Meta é a **fonte da verdade** dos templates (nome, status, categoria,
conteúdo). Decisão: ler/criar direto da Graph API, **sem tabela local**.

## Escopo

### Parte A — Criação e gestão de templates

1. **Camada Graph** (`src/lib/whatsapp/client.ts`):
   - `createTemplate(wabaId, { name, category, language, bodyText, examples })`
     → `POST /{wabaId}/message_templates` com
     `components: [{ type: "BODY", text: bodyText, example: { body_text: [examples] } }]`.
     `category` ∈ `MARKETING | UTILITY | AUTHENTICATION`. Retorna `{ id, status }`
     (status inicial `PENDING`).
   - `deleteTemplate(wabaId, name)` → `DELETE /{wabaId}/message_templates?name=...`
     (a Meta apaga por nome, todas as línguas daquele nome).
   - `listTemplates(wabaId, opts?)`: ganha `opts.all` — quando `true`, remove o
     filtro `status=APPROVED` e traz todos os status. Default continua só
     aprovados (o picker do chat não muda).

2. **Rota** `src/app/api/whatsapp/templates/route.ts` (autenticada, `getUser`):
   - `GET ?channelId=...&all=1` → lista todos os status (aba de gestão).
     Sem `all`, mantém o comportamento atual (só aprovados).
   - `POST` body `{ channelId, name, category, language, bodyText, examples }`:
     valida no servidor (ver regras abaixo), resolve `waba_id` pelo canal
     (com checagem de membership via RLS na leitura do canal), chama
     `createTemplate`. Erros da Meta viram `502` com a mensagem.
   - `DELETE ?channelId=...&name=...` → resolve `waba_id`, chama `deleteTemplate`.

   **Regras de validação (POST):**
   - `name`: `^[a-z0-9_]{1,512}$` (snake_case, minúsculo, sem espaços).
   - `category`: um dos três enums.
   - `language`: código BCP-47 (default `pt_BR`).
   - `bodyText`: não vazio; variáveis devem ser **sequenciais** a partir de 1
     (`{{1}}`, `{{2}}`, ... sem pular número).
   - `examples`: array com **um exemplo por variável** detectada; comprimento
     tem de bater com o nº de variáveis.

3. **Repo** (`src/lib/data/repos/db/whatsapp.ts`): adiciona a
   `whatsappActions`:
   - `listAllTemplates(channelId)` → `GET ?all=1`.
   - `createTemplate(channelId, input)` → `POST`.
   - `deleteTemplate(channelId, name)` → `DELETE`.

4. **UI** — `/whatsapp` passa a ter abas: **Canais** (atual) e **Templates**.
   - **Templates**: seletor de canal (auto-seleciona se só houver um) → lista da
     Meta com badge de status (🟡 Pendente / 🟢 Aprovado / 🔴 Rejeitado),
     categoria, idioma e prévia do corpo. Botão **Criar template**; ação de
     excluir por linha (confirmação).
   - **Diálogo de criação**: nome, categoria (select), idioma (default `pt_BR`),
     corpo (textarea com botão "inserir variável" → insere o próximo `{{n}}`),
     e um campo de **exemplo** por variável detectada. Valida no cliente antes de
     enviar; ao criar, toast "enviado pra revisão da Meta" e recarrega a lista.

### Parte B — Rastreio de entrega (exclusivo de templates)

5. **Migração** `supabase/migrations/0031_whatsapp_template_tracking.sql`
   (idempotente, segue o padrão do repo):
   - Em `public.messages`, adiciona:
     - `template_name text` — preenchido **só** quando o envio é template. É o
       marcador do que é "rastreável".
     - `delivered_at timestamptz`, `read_at timestamptz`, `failed_at timestamptz`.
     - `error_detail text` — motivo quando `status = failed`.
   - Índice parcial `messages_template_name_idx` em `(location_id, created_at desc)`
     `where template_name is not null` (a aba de Logs filtra por isso).
   - Sem novas policies: a `messages` já tem RLS por membership; as colunas
     entram nas policies existentes.

6. **Send route** (`/api/whatsapp/send`): no ramo `template`, grava
   `template_name: template.name` no insert da mensagem de saída. Texto livre
   continua sem `template_name` (não rastreável).

7. **Webhook** (`/api/whatsapp/webhook`), no laço de `statuses`:
   - **Não rebaixar**: define uma ordem `sent < delivered < read` e só avança
     `status` se o novo for mais alto (ou for `failed`). Implementado com um
     update condicional (compara a mensagem atual por `wa_message_id`).
   - Carimba o horário correspondente (`delivered_at`/`read_at`/`failed_at`) se
     ainda estiver nulo.
   - `failed`: grava `error_detail` a partir de `st.errors?.[0]?.title` (ou
     `message`). `failed_at` sempre pode ser gravado.
   - Vale para toda mensagem (o webhook não distingue template), mas a UI só
     mostra o rastreio dos templates.

8. **Aba "Logs"** em `/whatsapp` (terceira aba): tabela **só dos envios de
   template** (`template_name is not null`), colunas: contato, template, canal,
   **enviado / entregue / lido** (horários), status (badge), motivo da falha.
   Filtros por canal e status. Atualiza ao vivo (Realtime já publicado em
   `messages`). Texto livre não aparece.

## Fluxo de dados

**Criar template:** form → `whatsappActions.createTemplate` → `POST` → Graph API
→ `{ id, status: PENDING }` → toast + recarrega lista (a Meta revisa; o status
evolui e aparece no próximo carregamento).

**Rastreio:** envio de template → `send` grava `messages` com
`template_name`, `status='sent'` → Meta processa → webhook recebe `statuses`
→ carimba `delivered_at`/`read_at`/`failed_at` sem rebaixar → Realtime empurra o
UPDATE → aba Logs atualiza.

## Tratamento de erros

- Meta rejeita criação (nome duplicado, formato inválido, política): `502` com a
  mensagem da Graph API → toast no diálogo, form permanece aberto.
- Validação client + server (defesa em profundidade); server é a autoridade.
- Webhook: update condicional evita corrida de eventos fora de ordem.

## Testes

- Validação de `name`/variáveis/exemplos (unit, na função de validação).
- Ordem de status no webhook: `read` recebido antes de `delivered` atrasado não
  rebaixa (unit da função de "não rebaixar").
- Manual: criar template (fica PENDING), listar todos os status, excluir; enviar
  template e ver enviado→entregue→lido na aba Logs.

## Fora de escopo

- Tiques de status na conversa (o usuário pediu rastreio **só** em templates).
- Rastreio de mensagens de texto livre.
- Cabeçalho/mídia, rodapé e botões nos templates (só corpo + variáveis).
- Edição de template (a Meta trata edição como reenvio; fora por ora).
- Tabela local espelhando templates (Meta é a fonte da verdade).
