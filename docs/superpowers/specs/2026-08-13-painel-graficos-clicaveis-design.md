# Painel de controle — gráficos clicáveis — Design Spec

> Dá ação de clique aos widgets do painel: cada recorte abre as oportunidades que formam
> aquele número. Data: 2026-08-13. Convenções: `AGENTS.md`.
> **Sem migração, sem rota nova.** Registrado depois da implementação (PR #64, na `main`).

## Objetivo

O painel mostrava números certos e não levava a lugar nenhum. Nenhum dos seis widgets
tinha `onClick` — donut de Status, barras de Valor, medidor de Conversão, Funil,
Distribuição de fases e a tabela de fonte de leads eram desenho puro. Ver "2 oportunidades
abertas" sem poder perguntar *quais* transforma o painel em pôster.

## Decisão central: drill-down no lugar, não navegação

Duas saídas possíveis ao clicar:

**A. Levar para `/leads` filtrado.** Exigiria criar filtro por status e por fase na tela
de Leads, que hoje só tem pipeline + busca. Mais código, e tira o operador do painel.

**B. Abrir o detalhe ali mesmo** com as oportunidades daquele pedaço.

Escolhido **B**, com um atalho "Abrir no funil" para quem quiser agir. Motivo: a pergunta
que o clique faz é "quais registros formam este número?", e a resposta cabe num diálogo.
Vale igual para os seis widgets, então um componente serve a todos — mesmo padrão do
drill-down já usado em Pagamentos → Relatórios.

## Outras decisões

### O medidor de conversão: alvo é o anel inteiro

O arco tem ~8px e, com taxa 0% (o caso real hoje), **não existe arco para clicar**.
O bloco todo vira botão e abre as oportunidades ganhas.

### As legendas clicam também

Com duas fatias, acertar o donut é fácil; com dez fases, viram fatias de poucos graus.
A legenda é sempre alcançável e mostra o mesmo recorte.

### "Abrir no funil" exigiu mexer em `/leads`

O link passa `?pipeline=<id>`, mas a tela de Leads não lia parâmetro nenhum — abriria
sempre no primeiro pipeline. Sem essa parte, o botão seria mais um controle que faz a
coisa errada. `useSearchParams` obriga limite de Suspense, daí a casca no componente.

### A engrenagem saiu

Cada `WidgetCard` tinha um botão de engrenagem sem `onClick`. Não havia configuração de
widget para abrir. Volta quando existir.

## Escopo entregue

| Clique | Abre |
|---|---|
| Fatia/legenda do donut **Status da Oportunidade** | oportunidades daquele status |
| Barra do **Valor de Oportunidade** | idem, pelo valor |
| Anel da **Taxa de conversão** | as ganhas que formam a taxa |
| Faixa de fase no **Funil** | oportunidades da fase |
| Fatia/legenda da **Distribuição de fases** | idem |
| Linha do **Relatório de fonte de leads** | oportunidades daquela fonte |

O diálogo mostra nome, contato (com link para a ficha), fase, fonte, valor e status, mais
a contagem, o total em R$ e "Abrir no funil".

## Não-objetivos

- Filtro por status/fase dentro de `/leads` (a navegação leva ao pipeline, não ao recorte).
- Configuração de widgets (a engrenagem só volta com tela por trás).
- Widgets do Google Analytics — seguem em estado honesto de "não conectado".
- Exportação do recorte em CSV — Relatórios já cobre isso para Pagamentos.

## Arquitetura

```
components/dashboard/drilldown.tsx        useDrilldown() + <DrilldownDialog>
components/dashboard/opportunity-widgets.tsx   donut, barras, medidor
components/dashboard/funnel-widgets.tsx        funil, distribuição de fases
components/dashboard/report-widgets.tsx        fonte de leads
components/dashboard/widget-card.tsx           (engrenagem removida)
app/(app)/leads/page.tsx                       lê ?pipeline= dentro de <Suspense>
```

O recorte é sempre um `Opportunity[]` já filtrado pelo período do painel
(`useDashboardOps`), então o diálogo não refaz consulta nem duplica regra de filtro.

## Segurança

Nada novo: só leitura do que a página já carregou, sob a RLS existente.

## Testes / verificação

- `npx tsc --noEmit` + `npm run build`. O build acusou `useSearchParams()` sem Suspense
  na primeira tentativa — corrigido com a casca.
- Manual: clicar em cada um dos seis widgets e conferir contagem e total do diálogo
  contra o número mostrado no gráfico.
