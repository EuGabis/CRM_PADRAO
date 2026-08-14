# Pagamentos → Produtos: detalhe do produto (Detalhe · Ofertas · Vendas) — Design Spec

> Clicar num produto abre o detalhe com as mesmas abas do painel da Guru.
> Data: 2026-08-14. Convenções: `AGENTS.md`.

## Objetivo

A aba **Produtos** listava cards que não faziam nada ao clique. Espelhar o painel da
Guru: **Detalhe**, **Ofertas** e **Vendas** do produto, sem sair do CRM.

## Não-objetivos (v1)

- Aba **Auditoria** (a Guru mostra, mas não há endpoint público documentado para ela).
- **Editar** produto/oferta pelo CRM — leitura apenas; a Guru é a fonte da verdade.
- Criar oferta / gerar link de checkout (o link existente é só exibido).
- Guardar catálogo de produtos/ofertas no nosso banco (ver "De onde vem cada aba").

## De onde vem cada aba (decisão principal)

| Aba | Fonte | Por quê |
|---|---|---|
| Detalhe | objeto já carregado em `GET /api/v2/products` + KPIs de `payment_sales_monthly` | não gasta requisição nova; os KPIs somam o histórico inteiro agregado no Postgres |
| Ofertas | `GET /api/v2/products/{id}/offers` (ao vivo) | oferta muda no checkout; cache nosso ficaria mentindo sobre preço |
| Vendas | nosso `payment_events` | já sincronizado, pagina de verdade e não consome o limite de 360 req/min da Guru |

**Ofertas só é buscada quando a aba é aberta.** Buscar junto com o produto gastaria uma
chamada à Guru a cada card clicado, inclusive para quem só quer ver vendas.

## Casamento das vendas: `product_name` EXATO

`payment_events.product_name` vem de `product.name` — o mesmo campo no webhook e na API.
A aba usa `.eq("product_name", nome)`, **não** o `ilike %nome%` do filtro livre da aba
Vendas: ali o usuário digita um pedaço do nome; aqui o produto foi escolhido numa lista,
e um "contém" arrastaria as vendas de qualquer produto com nome prefixo
(ex.: "Aviônica + GMP Turbo" traria "Aviônica + GMP Turbo Anual").

KPIs vêm de `payment_sales_monthly` (migração 0020), não da página visível de 10 vendas —
somar o que está na tela daria um número convincente e errado.

## Autorização — `resolveGuruUserToken()`

Extraído de `products/route.ts` para `src/lib/integrations/guru-token.ts` porque agora
duas rotas precisam dele. Mantém a separação que já custou dois bugs em produção:

1. **Autorização** com a sessão do usuário (membership via RLS de `location_members`).
2. **Leitura do User Token** com a service role — `payment_credentials` é admin-only
   desde a 0008, e ler com a sessão do usuário fazia a tela responder "Guru não
   conectada" para todo mundo que não fosse administrador.

O token não sai do servidor: o navegador recebe só a lista de ofertas.

## Peças

- `src/lib/integrations/guru-token.ts` — `resolveGuruUserToken()` (novo).
- `src/lib/integrations/guru.ts` — `GuruOffer` + `fetchGuruProductOffers()`.
- `src/app/api/integrations/guru/products/[id]/offers/route.ts` — rota nova.
- `src/app/api/integrations/guru/products/route.ts` — passa a usar o helper.
- `src/lib/data/repos/db/payments.ts` — `usePaymentEventsForProduct()` (paginada) e
  `useProductSalesSummary()` (KPIs do histórico completo).
- `src/app/(app)/pagamentos/page.tsx` — card vira botão + `ProductDetailDialog`.

**Sem migração nova e sem env nova.** O filtro por `product_name` roda sobre poucos
milhares de linhas usando o índice de `location_id` — não justifica índice novo.

## Campos das ofertas

Confirmados no OpenAPI oficial (`api.docs.digitalmanager.guru/openapi/referencia-api/products.yaml`):
`value` (preço), `units_per_sale` (quantidade), `is_active`, `payment_types`,
`checkout_url`, `installments`, `plan` (`interval`, `interval_type`, `cycles`,
`trial_days`). A coluna "Valor Total" do painel da Guru é o `value` da oferta.
