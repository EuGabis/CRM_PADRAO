# Lito CRM Front-end Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o front-end completo do Lito CRM — 19 módulos navegáveis, 5 core profundos e interativos com dados mock tipados — conforme `docs/superpowers/specs/2026-08-06-crm-frontend-design.md`.

**Architecture:** Next.js App Router com layout compartilhado (sidebar + topbar), camada de dados mock atrás de repositórios sobre store Zustand, componentes shadcn/ui + componentes transversais próprios. UI nunca importa fixtures diretamente.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Zustand + dnd-kit + Recharts + lucide-react.

## Global Constraints

- Todo texto de UI em **pt-BR**.
- Nome/marca **somente** via `src/lib/config/brand.ts` (`brand.name = "Lito CRM"`); nunca hardcoded em telas.
- Referência funcional canônica: `MAPA_FUNCIONALIDADES.md` (seções citadas por tarefa). Spec: `docs/superpowers/specs/2026-08-06-crm-frontend-design.md`.
- Sem chamadas de rede; sem persistência entre reloads; UI consome apenas hooks/ações dos repositórios (`src/lib/data/repos/*`).
- Paleta: sidebar grafite/azul-noite (`#111827`–`#1e2436`), primário indigo `#6366f1`, verde WhatsApp `#22c55e`, vermelho SLA `#ef4444`. NÃO usar o roxo GoHighLevel.
- Alvo desktop; nada pode quebrar feio em telas menores.
- Cada tarefa termina com `npm run build` (ou dev server sem erro) + verificação visual + commit.
- Toda lista tem `EmptyState`; nenhuma rota renderiza quebrada.

---

### Task 1: Scaffold do projeto + marca + tema

**Files:**
- Create: projeto Next.js na raiz `C:\Users\Gabriel\Documents\crm 2.0` (via create-next-app em dir temporário e mover, pois a pasta não está vazia)
- Create: `src/lib/config/brand.ts`
- Modify: `src/app/globals.css`, `.gitignore`
- Test: `npm run build`

**Interfaces:**
- Produces: `brand: { name: string; shortName: string; tagline: string }`; CSS vars `--sidebar`, `--sidebar-accent`, `--primary`; alias `@/*` → `src/*`.

- [ ] **Step 1: Criar app Next.js**

```bash
cd "/c/Users/Gabriel/Documents/crm 2.0"
npx create-next-app@latest lito-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
# mover conteúdo para a raiz (a pasta já tem docs/, mp4, frames)
mv lito-tmp/* lito-tmp/.* . 2>/dev/null; rmdir lito-tmp
```

- [ ] **Step 2: Ignorar mídia de referência no git**

Adicionar ao `.gitignore`:

```
# material de referência (vídeo)
crm_ideia.mp4
crm_ideia_frames/
crm_ideia.txt
.code-review-graph/
```

- [ ] **Step 3: Instalar dependências e shadcn**

```bash
npm i zustand @dnd-kit/core @dnd-kit/sortable recharts date-fns
npx shadcn@latest init -d
npx shadcn@latest add button input table dialog dropdown-menu tabs badge avatar checkbox select popover sheet tooltip card separator switch accordion calendar scroll-area sonner textarea label
```

- [ ] **Step 4: Criar `src/lib/config/brand.ts`**

```ts
export const brand = {
  name: "Lito CRM",
  shortName: "Lito",
  tagline: "Seu negócio inteiro em um lugar",
} as const;
```

- [ ] **Step 5: Tokens de tema em `globals.css`**

```css
:root {
  --sidebar: #131826;
  --sidebar-hover: #1d2436;
  --sidebar-accent: #6366f1;
  --primary: #6366f1;
  --wa-green: #22c55e;
  --sla-red: #ef4444;
}
```

- [ ] **Step 6: Build e commit**

```bash
npm run build
git add -A && git commit -m "chore: scaffold Next.js + shadcn + marca Lito CRM"
```

---

### Task 2: Camada de dados — tipos, fixtures, store e repositórios

**Files:**
- Create: `src/lib/data/types.ts`, `src/lib/data/fixtures/{users,contacts,pipelines,opportunities,conversations,workflows,appointments}.ts`, `src/lib/data/store.ts`, `src/lib/data/repos/{contacts,opportunities,conversations,workflows}.ts`
- Test: `src/lib/data/__smoke__.test.md` não — verificação via página `/dev-data` temporária? Não: verificação por tipo (`tsc`) + uso nas tasks seguintes. `npm run build` valida tipos.

**Interfaces:**
- Produces (exatas, usadas por TODAS as tasks seguintes):

```ts
// types.ts
export type Channel = "whatsapp" | "instagram" | "facebook" | "sms" | "email";
export interface User { id: string; name: string; email: string; role: "admin" | "user"; color: string }
export interface Contact {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  company?: string; tags: string[]; ownerId: string; createdAt: string;
  lastActivityAt: string; lastActivityChannel: Channel; dnd: boolean;
  customFields: Record<string, string>;
}
export interface Stage { id: string; name: string; color: string; order: number }
export interface Pipeline { id: string; name: string; stages: Stage[] }
export interface Opportunity {
  id: string; contactId: string; pipelineId: string; stageId: string;
  name: string; source: string; value: number; ownerId?: string;
  status: "open" | "won" | "lost"; createdAt: string;
}
export type MessageType = "text" | "audio" | "event";
export interface Message {
  id: string; conversationId: string; direction: "in" | "out"; type: MessageType;
  channel: Channel; body: string; at: string; internal?: boolean; scheduledFor?: string;
}
export interface Conversation {
  id: string; contactId: string; channel: Channel; unreadCount: number;
  lastMessageAt: string; lastMessagePreview: string; starred: boolean; slaDays: number;
}
export type NodeCategory = "contato" | "oportunidade" | "comunicacao" | "logica" | "ia" | "marketing";
export interface WorkflowNode { id: string; kind: "trigger" | "action"; key: string; label: string; category: NodeCategory }
export interface Workflow {
  id: string; name: string; folder: string | null; status: "published" | "draft";
  enrolledTotal: number; enrolledActive: number; createdAt: string; updatedAt: string;
  trigger: WorkflowNode | null; actions: WorkflowNode[];
}
export interface Appointment { id: string; contactId: string | null; title: string; start: string; end: string; calendar: string; source: "google" | "crm" }
```

```ts
// store.ts — Zustand
export interface CrmState {
  users: User[]; contacts: Contact[]; pipelines: Pipeline[]; opportunities: Opportunity[];
  conversations: Conversation[]; messages: Message[]; workflows: Workflow[]; appointments: Appointment[];
}
export const useCrmStore: UseBoundStore<StoreApi<CrmState & CrmActions>>;
// CrmActions: moveOpportunity(id, stageId); sendMessage(conversationId, msg: Omit<Message,"id"|"conversationId"|"at">);
// toggleStar(conversationId); markRead(conversationId); addContact(c: Omit<Contact,"id"|"createdAt"|"lastActivityAt"|"lastActivityChannel">);
// updateContact(id, patch: Partial<Contact>); addTagToContacts(ids: string[], tag: string); removeTagFromContacts(ids: string[], tag: string);
// deleteContacts(ids: string[]); addOpportunity(o: Omit<Opportunity,"id"|"createdAt">);
// addWorkflow(name: string, folder?: string): string; setWorkflowTrigger(id, node); addWorkflowAction(id, node);
// removeWorkflowNode(workflowId, nodeId); toggleWorkflowStatus(id);
```

```ts
// repos/*.ts — hooks de leitura + ações re-exportadas (a UI SÓ importa daqui)
// contacts.ts: useContacts(), useContact(id), contactName(c), contactActions = { add, update, addTag, removeTag, remove }
// opportunities.ts: usePipelines(), usePipeline(id), useOpportunitiesByStage(pipelineId): Record<stageId, Opportunity[]>, stageTotal(ops): number, opportunityActions = { move, add }
// conversations.ts: useConversations(filter?: "unread"|"all"|"recent"|"starred"), useMessages(conversationId), conversationActions = { send, star, markRead }
// workflows.ts: useWorkflows(), useWorkflow(id), workflowActions = { create, setTrigger, addAction, removeNode, toggleStatus }
```

- [ ] **Step 1: Escrever `types.ts`** com o bloco acima, exatamente.
- [ ] **Step 2: Fixtures pt-BR** — `users.ts` (6 usuários: Gustavo admin, Camila, Emille, Halyson, Lucas admin, Rhayan admin); `pipelines.ts` (pipeline `pipe-controle` "✅ Controle de Leads" com 9 fases: NOVO LEAD cinza, NEGOCIANDO azul, QUENTE 🔥 rosa, TESTE GRÁTIS âmbar, FINALIZOU TESTE rosa, ASSINOU verde, FILA DEMO cinza, CALL DEMO cinza, PERDIDO vermelho; + pipeline `pipe-demo` "RHAYAN" com 4 fases); `contacts.ts` (50 contatos com nomes brasileiros, tags como "assinante"/"negociando"/"quente", UTM em customFields); `opportunities.ts` (80 distribuídas nas fases com fontes "Facebook", "Instagram", "Indicação", "Checkout", valores R$0–R$294); `conversations.ts` (20 conversas nos 5 canais com slaDays variados + ~8 mensagens cada em `messages`, incluindo 1 de áudio e 2 eventos de pipeline "Oportunidade movida de NEGOCIANDO → ASSINOU"); `workflows.ts` (8 workflows nas pastas "Entrada de Lead", "Pipeline", "Follow-up", null); `appointments.ts` (12 eventos na semana de 2026-08-03, mistura google/crm).
- [ ] **Step 3: `store.ts`** — `create<CrmState & CrmActions>()` inicializado com fixtures; ações imutáveis (ex.: `moveOpportunity` mapeia `opportunities` trocando `stageId`; `sendMessage` faz push em `messages` e atualiza `lastMessagePreview/lastMessageAt` da conversa).
- [ ] **Step 4: Repos** — cada arquivo exporta hooks com selectors (`useCrmStore(s => ...)`) e objeto `xActions` chamando `useCrmStore.getState()`.
- [ ] **Step 5: Verificar tipos e commitar**

```bash
npm run build
git add -A && git commit -m "feat(data): tipos, fixtures pt-BR, store Zustand e repositórios mock"
```

---

### Task 3: Shell — Sidebar, Topbar, SubNav, EmptyState e as 19 rotas

**Files:**
- Create: `src/components/layout/{sidebar.tsx,topbar.tsx,subnav.tsx}`, `src/components/shared/empty-state.tsx`, `src/lib/config/nav.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/<modulo>/page.tsx` para: dashboard, conversas, calendarios, contatos, leads, pagamentos, ai-studio, agentes-ia, marketing, automacoes, sites, assinaturas, midia, reputacao, relatorios, marketplace, whatsapp, configuracoes, ativacao
- Modify: `src/app/page.tsx` (redirect → `/dashboard`), `src/app/not-found.tsx`, `src/app/error.tsx`
- Test: navegar pelas 19 rotas no dev server

**Interfaces:**
- Consumes: `brand`.
- Produces: `NAV_ITEMS: { href: string; label: string; icon: LucideIcon; badge?: "Beta" }[]` (ordem exata da seção 2.1 do mapa, com Ativação no topo e Configurações no rodapé); `<SubNav tabs={{label, href?}[]} active={string} />`; `<EmptyState icon title description cta?>`.

- [ ] **Step 1: `nav.ts`** com os 19 itens na ordem do mapa (labels pt-BR: "Checklist de Ativação", "Painel de controle", "Conversas", "Calendários", "Contatos", "Leads", "Pagamentos", "AI Studio" [badge Beta], "Agentes de IA", "Marketing", "Automações", "Sites", "Assinaturas", "Mídia Drive", "Reputação", "Relatórios", "Marketplace", "WhatsApp", "Configurações").
- [ ] **Step 2: `sidebar.tsx`** — fundo `var(--sidebar)`, logo `brand.name`, seletor de subconta estático ("Lito Comercial — São Gonçalo, RJ" com chevron), busca com kbd "Ctrl K", lista de nav com item ativo (`usePathname`) em `var(--sidebar-accent)`, Configurações fixa no rodapé.
- [ ] **Step 3: `topbar.tsx`** — botões "Suporte" (verde), "Webphone", sino, avatar (placeholders clicáveis; painéis reais na Task 12).
- [ ] **Step 4: `layout.tsx` do grupo `(app)`** — grid `[240px_1fr]`, coluna direita com Topbar + `<main className="bg-slate-50">`.
- [ ] **Step 5: Páginas stub** — cada módulo com `<SubNav>` das sub-abas exatas do mapa (ex.: conversas: Conversas | Ações manuais | Trechos | Links de acionamento | Estatísticas | Configurações) + `<EmptyState>` central "Em construção" com ícone do módulo. `page.tsx` raiz: `redirect("/dashboard")`. `not-found.tsx`: 404 amigável com botão "Voltar ao painel".
- [ ] **Step 6: Verificar e commitar** — dev server, clicar nas 19 rotas.

```bash
git add -A && git commit -m "feat(shell): layout com sidebar/topbar e 19 rotas navegáveis"
```

---

### Task 4: Componentes transversais — DataTable, FilterDrawer, KpiCard, SlaBadge, ChannelIcon

**Files:**
- Create: `src/components/shared/{data-table.tsx,filter-drawer.tsx,kpi-card.tsx,sla-badge.tsx,channel-icon.tsx,bulk-bar.tsx}`
- Test: usados nas Tasks 5–9; verificação visual lá. Build valida tipos.

**Interfaces:**
- Produces:

```tsx
export interface Column<T> { key: string; header: string; sortable?: boolean; render: (row: T) => ReactNode }
export function DataTable<T extends { id: string }>(props: {
  data: T[]; columns: Column<T>[]; searchPlaceholder?: string; searchFn?: (row: T, q: string) => boolean;
  selectable?: boolean; onSelectionChange?: (ids: string[]) => void; bulkBar?: (ids: string[], clear: () => void) => ReactNode;
  pageSize?: number;
}): JSX.Element;

export interface FilterCondition { field: string; operator: "é" | "não é" | "contém"; value: string; join?: "E" | "OU" }
export function FilterDrawer(props: { open: boolean; onOpenChange: (o: boolean) => void; fields: string[]; onApply: (c: FilterCondition[]) => void }): JSX.Element;

export function KpiCard(props: { label: string; value: string; delta?: number; hint?: string }): JSX.Element;
export function SlaBadge(props: { days: number }): JSX.Element;       // "-16d" vermelho
export function ChannelIcon(props: { channel: Channel; size?: number }): JSX.Element;
```

- [ ] **Step 1:** `DataTable` — busca, ordenação por coluna (asc/desc no header), checkbox mestre + por linha, paginação ("Anterior | n | Próximo"), e quando `selectable` e há seleção, renderiza `bulkBar` no lugar do header (padrão seção 22 do mapa).
- [ ] **Step 2:** `FilterDrawer` — `Sheet` lateral direito, linhas campo/operador/valor com botões "E"/"OU" e "Limpar".
- [ ] **Step 3:** `KpiCard` (delta com seta ▲ verde / ▼ vermelha), `SlaBadge`, `ChannelIcon` (círculo colorido por canal com ícone lucide: MessageCircle/Instagram/Facebook/MessageSquare/Mail).
- [ ] **Step 4:** Build + commit `feat(shared): DataTable, FilterDrawer, KpiCard, SlaBadge, ChannelIcon`.

---

### Task 5: Dashboard profundo

**Files:**
- Create: `src/components/dashboard/{status-donut.tsx,value-bars.tsx,conversion-gauge.tsx,funnel-widget.tsx,stage-distribution.tsx,lead-source-table.tsx,manual-actions-card.tsx,ga-cards.tsx,date-filter.tsx,dashboard-switcher.tsx}`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Test: visual — comparar com seção 3 do mapa

**Interfaces:**
- Consumes: `usePipelines()`, `useOpportunitiesByStage()`, `useContacts()`, `KpiCard`.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1:** Widgets Recharts: `StatusDonut` (PieChart innerRadius, total central via label custom), `ValueBars` (BarChart horizontal + "Receita total"), `ConversionGauge` (RadialBarChart "0%" + "Receita ganha"), `FunnelWidget` (barras horizontais por fase com colunas Cumulativo/Próxima etapa % calculadas das oportunidades), `StageDistribution` (donut por fase com legenda valor/%). Todos com `<Select>` de pipeline no header do card.
- [ ] **Step 2:** `LeadSourceTable` (agrupa oportunidades por `source`: Total, Valores, Aberto, Ganho, Perdido, % ganhos), `ManualActionsCard` (contadores estáticos 0 + link), `GaCards` (6 métricas zeradas + área "Nenhum dado encontrado").
- [ ] **Step 3:** `DateFilter` (Popover com presets "Últimos 30 dias", "Trimestre passado" etc. + dois `Calendar` + campos De/Para + comparação — aplica apenas visualmente) e `DashboardSwitcher` (Popover com busca, "+ Adicionar painel", grupos "Meus painéis" / "Compartilhado comigo" — mock).
- [ ] **Step 4:** Compor `page.tsx`: header (switcher + título + DateFilter), grid `md:grid-cols-3` (donut/barras/gauge), depois `md:grid-cols-2` (funil/distribuição), depois full-width (fonte de leads, ações manuais, GA).
- [ ] **Step 5:** Build + visual + commit `feat(dashboard): painel com 9 widgets e filtros`.

---

### Task 6: Contatos profundo

**Files:**
- Create: `src/components/contacts/{contacts-table.tsx,contact-form-dialog.tsx,contact-detail.tsx,bulk-actions.tsx}`
- Modify: `src/app/(app)/contatos/page.tsx`; Create: `src/app/(app)/contatos/[id]/page.tsx`
- Test: visual + interações (seleção em massa, criar contato, tag em massa)

**Interfaces:**
- Consumes: `DataTable`, `FilterDrawer`, `useContacts()`, `contactActions`, `ChannelIcon`.
- Produces: rota `/contatos/[id]` usada pela Task 8 (link do painel do contato).

- [ ] **Step 1:** `contacts-table.tsx` — colunas: Nome (avatar com iniciais coloridas), Telefone, E-mail, Nome comercial, Criado, Última atividade (relativa via date-fns `ptBR` + `ChannelIcon`), Tags (badges). Header: contador "N Contatos", abas "Todos" + "+ Adicionar lista inteligente" (toast "em breve"), botões Filtros avançados (abre `FilterDrawer` com campos do contato + UTM), Importar (toast), "+ Adicionar Contato".
- [ ] **Step 2:** `bulk-actions.tsx` — barra contextual: "N selecionados · Selecionar todos", ações Exportar / Acionar automação / Enviar e-mail / Adicionar tags / Excluir + dropdown "Mais" com as 12 do mapa (seção 6.3). Funcionais de verdade: Adicionar/Remover tags (prompt de tag → `contactActions.addTag`), Excluir (confirm → remove). Demais: toast "simulado".
- [ ] **Step 3:** `contact-form-dialog.tsx` — Dialog com Nome*, Sobrenome*, E-mail, Telefone, Empresa, Tags → `contactActions.add`.
- [ ] **Step 4:** `[id]/page.tsx` — detalhe: card de campos (incl. customFields), oportunidades do contato, botão "Abrir conversa".
- [ ] **Step 5:** Build + visual + commit `feat(contatos): tabela completa com ações em massa e filtros`.

---

### Task 7: Leads — Kanban com drag & drop

**Files:**
- Create: `src/components/pipeline/{kanban-board.tsx,stage-column.tsx,opportunity-card.tsx,opportunity-dialog.tsx,list-view.tsx}`
- Modify: `src/app/(app)/leads/page.tsx`
- Test: arrastar card entre fases e ver soma/contagem recalcular

**Interfaces:**
- Consumes: `usePipelines()`, `useOpportunitiesByStage()`, `opportunityActions.move/add`, `useContacts()`.
- Produces: nada externo.

- [ ] **Step 1:** `kanban-board.tsx` — `DndContext` (dnd-kit) com colunas droppable e cards draggable (`useDraggable`/`useDroppable`); `onDragEnd` → `opportunityActions.move(activeId, overStageId)`; `DragOverlay` com ghost do card.
- [ ] **Step 2:** `stage-column.tsx` — header com nome (emoji), contagem, soma `R$` formatada (`Intl.NumberFormat pt-BR`), barra de cor da fase, botão colapsar (coluna vira faixa vertical de 40px com texto rotacionado).
- [ ] **Step 3:** `opportunity-card.tsx` — nome, "Fonte:", "Valor:", avatar do owner (ou ícone atribuir), rodapé de quick-actions (Phone, MessageCircle, Tag, FileText, CheckSquare, Calendar) com tooltips e badges.
- [ ] **Step 4:** `page.tsx` — SubNav (Leads | Pipelines | Ações em massa), seletor de pipeline + badge "N leads", toolbar (Filtros avançados, Classificar, busca, toggle kanban/lista, Importar, "+ Adicionar oportunidade" → `opportunity-dialog` com contato/fase/valor/fonte). `list-view.tsx` reusa `DataTable`.
- [ ] **Step 5:** Build + testar drag & drop + commit `feat(leads): kanban 9 fases com drag & drop funcional`.

---

### Task 8: Conversas — inbox 4 colunas (parte 1: rail, lista e thread)

**Files:**
- Create: `src/components/inbox/{views-rail.tsx,conversation-list.tsx,conversation-item.tsx,thread.tsx,message-bubble.tsx,audio-player.tsx,pipeline-event.tsx}`
- Modify: `src/app/(app)/conversas/page.tsx`
- Test: visual + marcar lida, favoritar, trocar filtros/ordenação

**Interfaces:**
- Consumes: `useConversations()`, `useMessages()`, `conversationActions`, `SlaBadge`, `ChannelIcon`, `useContact()`.
- Produces: `<Thread conversationId>` e state `selectedConversationId` (Zustand local via `useState` no page, passado por props) — Task 9 pluga composer e painel direito no mesmo page.

- [ ] **Step 1:** `views-rail.tsx` — coluna 48px: ícones + (novo), busca, pessoa, grupo, bot, olho (Popover "Visualizações": busca, "+ Criar visualização", views mock "ORGANIZAR", "CALL DEMO", "QUENTE 🔥").
- [ ] **Step 2:** `conversation-list.tsx` — título "Caixa de entrada", abas Não lidos (badge) | Todos | Recentes | Marcados; dropdown de ordenação (6 opções do mapa incl. "Maior atraso de SLA"); `conversation-item.tsx` com avatar+`ChannelIcon`, nome, `SlaBadge`, badge de não lidas, prévia, estrela (→ `conversationActions.star`). Clique seleciona e `markRead`.
- [ ] **Step 3:** `thread.tsx` — header (avatar, nome, SlaBadge, botão verde "Ligar" com ícone WhatsApp, estrela, lixeira desabilitada), corpo com separadores de data, `message-bubble.tsx` (in cinza-esq / out indigo-dir, horário), `audio-player.tsx` (play/pause fake com barra de progresso animada e waveform em divs), `pipeline-event.tsx` (chip central "Oportunidade movida de X → Y · Detalhes").
- [ ] **Step 4:** `page.tsx` — grid 4 colunas `[48px_320px_1fr_360px]`; painel direito placeholder "Selecione uma conversa" por enquanto.
- [ ] **Step 5:** Build + visual + commit `feat(conversas): rail, lista com SLA e thread com eventos de pipeline`.

---

### Task 9: Conversas — parte 2: composer multi-canal e painel do contato

**Files:**
- Create: `src/components/inbox/{composer.tsx,schedule-dialog.tsx,contact-panel.tsx,panel-sections.tsx}`
- Modify: `src/app/(app)/conversas/page.tsx`
- Test: enviar mensagem em cada canal, nota interna, agendar, navegar sub-painéis

**Interfaces:**
- Consumes: `conversationActions.send`, `useContact`, `useMessages`, rota `/contatos/[id]` (Task 6).
- Produces: nada externo.

- [ ] **Step 1:** `composer.tsx` — abas de canal (Select: WhatsApp | SMS | E-mail) + toggle "Comentário Interno" (fundo âmbar); modo e-mail mostra campos De/Para/Assunto; toolbar de ícones (emoji, anexo, mic, tag, raio, $ — tooltips, ação toast) + botão relógio (abre `schedule-dialog`) + "Enviar" → `conversationActions.send({direction:"out", type:"text", channel, body, internal})`.
- [ ] **Step 2:** `schedule-dialog.tsx` — data (Calendar), hora (input time), fuso (Select "GMT-03:00 São Paulo"), "Programar" → `send` com `scheduledFor` e toast "Mensagem agendada".
- [ ] **Step 3:** `contact-panel.tsx` — rail direito de ícones (pessoa, relógio, tarefas, lápis, calendário, arquivo) alternando `panel-sections.tsx`: Campos (abas Todos/DND/Ações; accordion Contato + customFields; aba Ações lista oportunidades do contato com pipeline > fase e valor), Tarefas/Observações/Compromissos/Arquivos (padrão título + "+ Adicionar" + busca + EmptyState; Arquivos com abas Todos/Interno/Enviado/Recebido). Link "Ver contato completo" → `/contatos/[id]`.
- [ ] **Step 4:** Build + testar envio/nota/agendamento + commit `feat(conversas): composer multi-canal e painel lateral do contato`.

---

### Task 10: Automações — lista e builder visual

**Files:**
- Create: `src/components/automations/{workflow-list.tsx,workflow-builder.tsx,node-card.tsx,node-picker.tsx,node-catalog.ts}`
- Modify: `src/app/(app)/automacoes/page.tsx`; Create: `src/app/(app)/automacoes/[id]/page.tsx`
- Test: criar workflow, escolher trigger, adicionar/remover 3 ações, publicar

**Interfaces:**
- Consumes: `useWorkflows()`, `useWorkflow(id)`, `workflowActions`.
- Produces: `NODE_CATALOG: { triggers: WorkflowNode-like[]; actions: (WorkflowNode-like & { category: NodeCategory })[] }`.

- [ ] **Step 1:** `node-catalog.ts` — 10 triggers do mapa (Etapa do funil alterada, Tag de contato, Cliente respondeu, Compromisso agendado, Contato criado, Lembrete de aniversário, Contato alterado, Contato com DND, Formulário enviado, Chamada perdida) e 16 ações por categoria (Criar/atualizar oportunidade, Atribuir ao usuário, Adicionar tag, Remover tag, Atualizar campo, Adicionar tarefa, Enviar WhatsApp, Enviar SMS, Enviar e-mail, If/Else, Esperar, Ir para, Split test, Webhook, API de conversão da Meta, Agente de IA).
- [ ] **Step 2:** `workflow-list.tsx` — agrupamento por pasta (accordion), `DataTable` (Nome, Status badge Published verde/Draft cinza, Total de inscritos, Ativos, Atualizado, Criado), botões "Criar pasta" (toast), "Construa usando IA" (borda indigo, toast "em breve"), "+ Criar fluxo de trabalho" → `workflowActions.create` + `router.push`.
- [ ] **Step 3:** `[id]/page.tsx` + `workflow-builder.tsx` — header (nome editável inline, toggle Rascunho/Publicar via Switch → `toggleStatus`, "Salvo" estático, voltar); canvas fundo pontilhado (`background-image: radial-gradient`) com coluna central: `node-card.tsx` do trigger (ou "+ Adicionar acionador"), conectores verticais com "+" entre nós, cards de ação (ícone da categoria, label, X para remover), nó "FIM".
- [ ] **Step 4:** `node-picker.tsx` — Sheet direito com busca e abas Gatilhos/Ações agrupadas por categoria; clique → `setTrigger`/`addAction`.
- [ ] **Step 5:** Build + fluxo completo manual + commit `feat(automacoes): lista com pastas e builder visual de workflows`.

---

### Task 11: Módulos shell A — Calendários, Pagamentos, Agentes de IA, Ativação

**Files:**
- Modify: `src/app/(app)/{calendarios,pagamentos,agentes-ia,ativacao}/page.tsx`
- Create: `src/components/modules/{week-calendar.tsx,payment-integrations.tsx,documents-table.tsx,ai-agent-config.tsx,activation-checklist.tsx}`
- Test: visual contra seções 5, 8, 9 e 21 do mapa

**Interfaces:**
- Consumes: `useAppointments` (novo hook em repos — adicionar `repos/appointments.ts` com `useAppointments()`), `KpiCard`, `EmptyState`.

- [ ] **Step 1:** Calendários — `week-calendar.tsx`: grade semanal CSS grid (7 colunas × horas 8–19), eventos posicionados por horário, cor por origem (google = verde-borda, crm = indigo), header com navegação ‹ › e Selects Visualização/Calendário. SubNav: Visualização de calendário | Lista de compromissos | Configurações.
- [ ] **Step 2:** Pagamentos — SubNav das 12 sub-abas do mapa; conteúdo: `payment-integrations.tsx` (cards Stripe, PayPal, Mercado Pago, Square, Adyen, Authorize.net, NMI, Métodos manuais — logo por letra, descrição, botão "Conectar" toast) e `documents-table.tsx` (abas de status com contadores Rascunho/Aguardando/Concluído/Pagamentos/Arquivado + DataTable Título/Status/Cliente/Data/Valor com 4 docs mock).
- [ ] **Step 3:** Agentes de IA — SubNav (Começando | IA de voz | Conversation AI | Base de Conhecimento | Modelos | Content AI | Logs); `ai-agent-config.tsx`: 4 KpiCards (contatos únicos, ações, compromissos, tempo economizado), tabela de agentes (Nome, badge Principal, Status Sugestivo/Desativado, Canais) e tela de config com os 3 Textareas (Personalidade / Meta / Informações adicionais), Select de modelo "GPT-4.1", chips togglables das 7 ações (Agendamento, Acionar fluxo, Informações de contato, Parar bot, Transferência humana, Transferir bot, Follow-up) com badge de contagem, e painel "Testar seu bot" (chat mock que ecoa "Resposta simulada da IA").
- [ ] **Step 4:** Ativação — tema dark do módulo: `activation-checklist.tsx` com anel de progresso ("0 de 7 passos"), card "Próximo passo", accordions dos passos 0–6 do mapa cada um com bullets e botão "Marcar como concluída" (estado local, atualiza anel), cards laterais "Precisa de ajuda?" e "Custos adicionais".
- [ ] **Step 5:** Build + visual + commit `feat(shell): calendários, pagamentos, agentes de IA e checklist de ativação`.

---

### Task 12: Módulos shell B — Marketing, Sites, Assinaturas, Mídia, Reputação, Relatórios + painéis do Topbar

**Files:**
- Modify: `src/app/(app)/{marketing,sites,assinaturas,midia,reputacao,relatorios}/page.tsx`, `src/components/layout/topbar.tsx`
- Create: `src/components/modules/{social-planner.tsx,social-connect-dialog.tsx,funnels-forms.tsx,client-portal.tsx,media-grid.tsx,reputation-grid.tsx,ads-report.tsx}`, `src/components/layout/{support-panel.tsx,webphone-panel.tsx}`
- Test: visual contra seções 10, 12, 13, 14, 15, 16 do mapa

- [ ] **Step 1:** Marketing — SubNav (Planejador Social | E-mails | Trechos | Contadores | Links | Afiliados | Brand Boards | Anúncios); `social-planner.tsx`: sub-abas internas (Planejador | Conteúdo | Comentários | Estatísticas | Escuta social | Configurações), tabela de 5 publicações mock (Legenda, Status Publicado/Rascunho, Tipo, Data, Rede) e botão "+ Redes sociais" → `social-connect-dialog.tsx` (grid dos 10 botões Conectar: Facebook, Instagram, GBP, LinkedIn, TikTok, YouTube, Pinterest, Threads, Bluesky, Comunidade).
- [ ] **Step 2:** Sites — SubNav das 14 sub-abas; `funnels-forms.tsx`: Funis com EmptyState rico ("Comece criando um funil" + botão) e Formulários com DataTable (5 forms mock: Nome, Atualizado em, Atualizado por).
- [ ] **Step 3:** Assinaturas — SubNav (Portal do cliente | Cursos | Comunidades | Certificados); `client-portal.tsx`: card de URL do portal com botão copiar, KpiCards Convidados/Usuários, cards de ações (Gerar link mágico, Convidar, Enviar e-mail de login — toasts).
- [ ] **Step 4:** Mídia — `media-grid.tsx`: toolbar (Conectar Canva, indicador "14 GB", Nova pasta, Carregar), grid de 8 cards mock (vídeo/imagem/csv com ícone por tipo); Reputação — SubNav (Visão geral | Solicitações | Avaliações | Depoimentos | Widgets | Listagens | Configurações) + `reputation-grid.tsx`: 12 cards de plataformas (Google, Facebook "Conexão ativa", Booking, Airbnb, Amazon, Capterra...) com status e botão Conectar.
- [ ] **Step 5:** Relatórios — SubNav (Personalizados | Google Ads | Meta Ads | Atribuição | Ligações | Agentes | Compromissos); `ads-report.tsx`: banner "dados de amostra", 3 gráficos de área Recharts (Impressões/Cliques/Conversões), 4 KpiCards (Gasto, CPC, Custo/conversão, Taxa), DataTable de 5 campanhas (Campanha, Status, Cliques, Custo, Receita, ROI%, CTR, Leads, CPL).
- [ ] **Step 6:** Topbar — `support-panel.tsx` (Sheet: "Precisa de ajuda?" + chat mock com botões de opção) e `webphone-panel.tsx` (Popover: display, teclado 1-9/*/0/#, botão verde ligar, abas Recentes | Contatos | Teclado | Correio | Fila).
- [ ] **Step 7:** Build + visual + commit `feat(shell): marketing, sites, assinaturas, mídia, reputação, relatórios e painéis do topbar`.

---

### Task 13: Módulos shell C — Marketplace, WhatsApp, Configurações

**Files:**
- Modify: `src/app/(app)/{marketplace,whatsapp,configuracoes}/page.tsx`
- Create: `src/components/modules/{marketplace-grid.tsx,whatsapp-instances.tsx,whatsapp-official.tsx,settings-nav.tsx,team-table.tsx,permissions-form.tsx}`, `src/app/(app)/configuracoes/{perfil,equipe,whatsapp,telefonia}/page.tsx`
- Test: visual contra seções 17, 18, 19, 20 do mapa

- [ ] **Step 1:** Marketplace — `marketplace-grid.tsx`: sidebar de filtros (accordions Coleções/Categorias/Nicho/Preço), header "1505 Apps" + busca, grid de 12 cards (Canva, CloseBot, Zoom, Kixie, WhatsApp ChatBot, Twilio, WooCommerce, Telegram... com estrelas, dev, "Gratuito"), paginação "1 2 3 … 72".
- [ ] **Step 2:** WhatsApp — abas API Não Oficial | API Oficial. Não oficial: `whatsapp-instances.tsx` tema dark, grid de 6 cards de instância (nome, número mascarado, status bolinha verde/cinza, "#n") + botão "+ Nova instância" (toast). Oficial: `whatsapp-official.tsx` com abas Números (badges "Aprovado", "Verificado", tabela do número (21) 3828-0872 com qualidade Verde) e Modelos (DataTable: nome, idioma "Portuguese (BR)", categoria Marketing/Utility, preview com `{{1}}`, status Ativo).
- [ ] **Step 3:** Configurações — `settings-nav.tsx`: sidebar interna com "← Voltar" e 3 grupos do mapa (Minha Empresa / Empresariais / Configurações), rotas: `/configuracoes/perfil` (form empresa: nome, logo, endereço, fuso — estado local), `/configuracoes/equipe` (`team-table.tsx` com os 6 usuários + `permissions-form.tsx`: Função Admin/Usuário, checkbox "Limitar visibilidade a dados atribuídos", árvore de 8 categorias de permissão com Switch master + checkboxes), `/configuracoes/whatsapp` (link para módulo), `/configuracoes/telefonia` (card do webphone). Demais itens do menu → EmptyState.
- [ ] **Step 4:** Build + visual + commit `feat(shell): marketplace, whatsapp e configurações com equipe/permissões`.

---

### Task 14: Verificação final e polimento

**Files:**
- Modify: qualquer arquivo com problema encontrado
- Test: `npm run build` limpo + navegação completa

- [ ] **Step 1:** `npm run build` — zero erros TS/ESLint.
- [ ] **Step 2:** Navegar pelas 19 rotas comparando com `MAPA_FUNCIONALIDADES.md`; checklist de interações: mover card no kanban, enviar mensagem (3 canais + nota interna), agendar mensagem, seleção em massa + tag em contatos, criar contato, criar workflow com trigger + 3 ações + publicar, marcar passos da ativação.
- [ ] **Step 3:** Ajustes de consistência visual (espaçamentos, cores fora da paleta, textos em inglês esquecidos).
- [ ] **Step 4:** Commit final `chore: verificação final do front-end Lito CRM` e resumo para o usuário.
