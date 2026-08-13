# Painel de controle — gráficos clicáveis — Implementation Plan

> **Registro pós-implementação.** Já executado e mesclado na `main` (PR #64); as caixas
> estão marcadas porque descrevem o que foi feito, não trabalho pendente.

**Goal:** Fazer cada widget do painel responder ao clique abrindo as oportunidades que
formam o número, e tirar do caminho o que não tem ação.

**Architecture:** Um componente de drill-down compartilhado (`useDrilldown` +
`DrilldownDialog`) que recebe um `Opportunity[]` já filtrado pelo período; cada widget só
decide o recorte. Sem migração e sem rota nova.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind · shadcn/ui (Base UI) ·
Recharts 3 · repos existentes (`db/pipeline.ts`, `db/contacts.ts`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-13-painel-graficos-clicaveis-design.md`. Convenções: `AGENTS.md`.
- **Recharts 3:** `<Pie>`/`<Bar>` recebem `onClick={(_, index) => ...}` — usar o **índice**
  contra o próprio array de dados, não o payload do evento. Manter `rootTabIndex={-1}` nos
  `<Pie>`: sem isso o `<g>` nasce focável e o anel de foco do SVG desenha um quadrado em
  volta do donut (bug já corrigido antes; não reintroduzir).
- **Hooks antes de early return:** `FunnelWidget`/`StageDistribution` retornam `null` sem
  pipeline — `useDrilldown()` tem de vir antes disso.
- **Sem runner:** verificação = `npx tsc --noEmit` + `npm run build`.
- **Texto pt-BR.** Commits `fix(painel): ...`. Branch → PR → squash na `main`.

---

## File Structure

**Criado:** `src/components/dashboard/drilldown.tsx`

**Modificados:** `opportunity-widgets.tsx` · `funnel-widgets.tsx` · `report-widgets.tsx` ·
`widget-card.tsx` · `src/app/(app)/leads/page.tsx`

---

## Task 1: Componente de drill-down

- [x] **Step 1: Estado + diálogo**

`useDrilldown()` devolve `{ drilldown, open, close }`; `DrilldownState` é
`{ title, ops, pipelineId? }`. `DrilldownDialog` resolve nome do contato
(`useDbContacts`) e nome da fase (mapa montado com `useMemo` sobre `useDbPipelines`),
mostra contagem + total em R$ e o link "Abrir no funil".

- [x] **Step 2: Conteúdo**

Tabela `text-xs` com oportunidade, contato (link para `/contatos/[id]`), fase, fonte,
valor e status (badge). Cabeçalho `sticky`, corpo com scroll próprio
(`max-h-[80vh]` + `min-h-0` no flex) e estado vazio.

---

## Task 2: Widgets de oportunidade

- [x] **Step 1: Donut de Status** — `onClick` na `<Pie>` por índice, mesma função na legenda.
- [x] **Step 2: Barras de Valor** — `onClick` na `<Bar>` por índice.
- [x] **Step 3: Medidor de Conversão** — o bloco vira `<button>` e abre as ganhas.
      O `<span>` central mantém `pointer-events-none` para não roubar o clique.

Cada widget passa `pipelineId` quando o seletor não está em "Todos os pipelines", para o
"Abrir no funil" cair no lugar certo.

---

## Task 3: Funil e distribuição de fases

- [x] **Step 1: Funil** — cada faixa vira `<button>` mantendo a largura proporcional
      (`style.width`) e o `title` com a contagem. Guardar `ops` na linha evita refiltrar
      no clique.
- [x] **Step 2: Distribuição** — `onClick` na `<Pie>` por índice + legenda clicável.

---

## Task 4: Fonte de leads, engrenagem e `?pipeline=`

- [x] **Step 1: Linhas clicáveis** na tabela de fonte de leads + estado vazio (antes
      sobrava só o cabeçalho quando não havia oportunidade no período).
- [x] **Step 2: Remover a engrenagem** do `WidgetCard` e o import órfão `Settings2`.
- [x] **Step 3: `/leads` lê `?pipeline=`** — `useSearchParams` no inicializador do
      `useState`, componente renomeado para `LeadsPageInner` e exportado dentro de
      `<Suspense fallback={null}>`.

- [x] **Step 4: Verificar build**

`npx tsc --noEmit && npm run build` — a primeira execução falhou com
*"useSearchParams() should be wrapped in a suspense boundary at page /leads"*; corrigido
no Step 3 e refeito limpo.

---

## Handoff (Gabriel — fora do código)

Nenhum. Não há env, migração ou passo manual.

## Self-Review (autor do plano)

- **Cobertura da spec:** seis widgets clicáveis → Tasks 2-4; drill-down único → Task 1;
  "Abrir no funil" real → Task 4.3; engrenagem removida → Task 4.2. ✓
- **Recharts:** clique por índice em `<Pie>`/`<Bar>`; `rootTabIndex={-1}` preservado. ✓
- **Ponto de atenção 1:** o diálogo é montado uma vez por widget (cada um tem o seu
  `useDrilldown`). Custa pouco e evita elevar estado ao painel, mas se um dia um widget
  precisar abrir o drill-down de outro, isso vira estado compartilhado.
- **Ponto de atenção 2:** o recorte herda o período do painel. Se o filtro de data
  mudar com o diálogo aberto, a lista **não** se atualiza — está congelada no clique.
  Aceitável, mas é uma diferença sutil em relação aos gráficos ao lado.
