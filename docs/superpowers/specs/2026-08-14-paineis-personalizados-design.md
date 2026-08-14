# Painel de controle: visualizações por usuário e por departamento — Design Spec

> Cada usuário monta o próprio painel (quais widgets, em que ordem, com qual
> pipeline); administradores montam painéis para departamentos. Novos widgets de
> Pagamentos para quem tem acesso ao módulo. Data: 2026-08-14.
> Convenções: `AGENTS.md`. Migração: **0037** (aplicar no SQL Editor).

## Objetivo

O seletor de painéis do topo era decorativo: três nomes fixos no código
("(Padrão) Visão Geral", "SDR Acompanhamento", "Funil Comercial"), um grupo
"Compartilhado comigo" sem compartilhamento nenhum por trás, e um "Adicionar
painel" que só emitia toast. Dar lastro a ele e deixar o painel realmente
pessoal.

## Não-objetivos (v1)

- Arrastar widget na grade (a ordem é definida no diálogo, com setas).
- Redimensionar widget (cada um tem largura fixa pelo catálogo).
- Compartilhar painel com uma pessoa específica (só pessoal ou departamento).
- Painel por papel/empresa inteira.
- Widget novo de oportunidade — os cinco que o usuário citou já existiam; o que
  faltava era poder escolher quais aparecem.

## Escopos (decisão principal)

Uma tabela, dois escopos, com `check` garantindo que a linha tem exatamente um
dono:

| scope | dono | quem lê | quem edita |
|---|---|---|---|
| `user` | `user_id` | só o dono | só o dono |
| `department` | `department_id` | todo mundo do departamento | só admin |

Guardar os dois na mesma tabela mantém **uma consulta só** no seletor — que
precisa listar as duas coisas juntas de qualquer forma.

**A regra é RLS, não UI.** Um usuário comum não consegue editar painel de
departamento nem pela API: a policy exige `private.is_admin(location_id)`.
O helper `private.user_department_ids()` é SECURITY DEFINER pelo mesmo motivo de
`private.channel_allowed` (0035) — a policy consulta `location_members`, que tem
RLS própria, e sem o definer a regra ficaria circular.

`location_id` está nos dois escopos porque o mesmo usuário pode ser membro de
mais de uma empresa e os ids de pipeline de uma não existem na outra.

**Padrão único por escopo** garantido por índice parcial único — duas abas
marcando padrão ao mesmo tempo não conseguem criar dois.

## Layout de fábrica

Quem nunca personalizou vê `DEFAULT_WIDGETS`, que é **exatamente** o painel fixo
que existia no código. Ninguém perde nada ao ganhar a personalização, e o
primeiro "Personalizar" cria o painel já com esse conteúdo para editar em cima —
em vez de abrir um painel vazio e deixar a pessoa adivinhar o que existe.

## Pipeline por widget

O pedido era: "no funil quero o resumo do pipeline Gerenciador Cibelle". Cada
widget que aceita pipeline guarda a escolha **na visualização**
(`widgets[].pipelineId`), então ela sobrevive ao recarregamento — que é o ponto
de ter um painel salvo.

`usePipelineSelection` só trata o widget como controlado quando existe handler.
Sem ele (layout de fábrica, ou painel de departamento aberto por quem não edita)
o seletor volta a ser local: a troca vale para a visita e não persiste — travar
o seletor no valor salvo, sem reagir ao clique, seria pior.

Funil e Distribuição de fases **não** oferecem "Todos os pipelines": não existe
soma de fases entre funis diferentes que signifique alguma coisa.

## Widgets de Pagamentos

Três, todos marcados com `requires: "pagamentos"`:

- **Vendas recentes** — as 8 mais recentes do período, filtradas **no banco**
  (são milhares de linhas; filtrar no client filtraria só a página).
- **Receita por mês** — últimos 6 meses de `payment_sales_monthly`. Não segue o
  filtro de período de propósito: a agregação é mensal e um período "hoje" daria
  uma barra só, enganando.
- **Assinaturas** — ativas/atrasadas/canceladas, estado atual. O rótulo diz que
  não segue o filtro de período.

A permissão é checada em **duas** camadas: o widget não é desenhado se a pessoa
não enxerga o módulo (um painel de departamento pode incluir Pagamentos e ser
aberto por quem não tem acesso), e a RLS das tabelas da Guru continua sendo a
fronteira real. No diálogo, o widget bloqueado aparece **desabilitado com
cadeado** em vez de sumir: some sem explicação viraria "por que o painel dele
tem um card que o meu não tem?".

## Peças

- `supabase/migrations/0037_dashboard_views.sql` — tabela + `private.user_department_ids()`.
- `src/lib/data/repos/db/dashboards.ts` — `useDashboardViews`, `dashboardActions`.
- `src/components/dashboard/widget-catalog.ts` — catálogo (título, largura, se
  pede pipeline, permissão exigida) e `DEFAULT_WIDGETS`.
- `src/components/dashboard/widget-renderer.tsx` — config → componente.
- `src/components/dashboard/customize-dialog.tsx` — escolher/ordenar/configurar.
- `src/components/dashboard/payment-widgets.tsx` — os três widgets da Guru.
- `src/components/dashboard/dashboard-switcher.tsx` — reescrito sobre dados reais.
- `src/app/(app)/dashboard/page.tsx` — grade de 6 colunas montada da config.

## Passo manual pendente

Aplicar `0037_dashboard_views.sql` no SQL Editor do Supabase. Até lá, o painel
segue funcionando no layout de fábrica: a consulta falha, o repo não marca
`loaded` e a tela cai em `DEFAULT_WIDGETS` — mas nada é salvo.
