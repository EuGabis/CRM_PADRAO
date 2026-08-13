# Conversas — caixa de entrada completa — Implementation Plan

> **Registro pós-implementação.** As três rodadas já foram executadas e mescladas na
> `main` (PRs #56, #58, #60); as caixas estão marcadas porque descrevem o que foi feito,
> não trabalho pendente. Serve de referência para quem for mexer nestes arquivos depois.

**Goal:** Dar dado real a todo controle da caixa de entrada — rail, agendamento e ciclo
de vida da conversa —, removendo o que não tinha como funcionar.

**Architecture:** Três migrações aditivas (0027/0028/0029), o repo `db/conversations.ts`
como única porta para o banco, um store de filtro compartilhado entre rail e lista, e o
disparo das agendadas pegando carona no tick de minuto que já existe.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind · shadcn/ui (Base UI) ·
Zustand · Supabase (RLS + Realtime + pg_cron) · date-fns/ptBR · sonner.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-13-conversas-caixa-completa-design.md`. Convenções: `AGENTS.md`.
- **Migrações idempotentes**, número livre conferido com `git pull` (o banco é um só para
  os dois Claudes; 0024 e 0026 colidiram no meio do caminho e exigiram renumerar).
- **Base UI, não Radix:** `PopoverTrigger`/`DropdownMenuTrigger`/`TooltipTrigger` usam
  `render={...}` com children fora; `SelectValue` com children explícito.
- **Zustand:** nunca filtrar/mapear dentro do selector — selecionar o array cru e derivar
  com `useMemo`.
- **Sem runner de testes:** verificação = `npx tsc --noEmit` **e** `npm run build` limpos,
  mais consulta ao `information_schema` para confirmar o que a migração criou.
- **Texto pt-BR.** Commits `feat(conversas): ...`. Branch → PR → squash na `main`.

---

## File Structure

**Criados:**
- `supabase/migrations/0027_conversas_rail.sql`
- `supabase/migrations/0028_mensagens_agendadas.sql`
- `supabase/migrations/0029_conversas_finalizar_arquivar.sql`
- `src/components/inbox/inbox-filters.ts` — store de filtro (escopo, aba, ordenação, busca, pilha).
- `src/lib/messages/scheduled.ts` — `dispatchScheduledMessages()`.

**Modificados:**
- `src/lib/data/types.ts` · `src/lib/data/repos/db/conversations.ts`
- `src/components/inbox/{views-rail,conversation-list,thread,composer}.tsx`
- `src/app/(app)/conversas/page.tsx` · `src/app/api/automations/tick/route.ts`
- `src/lib/automations/actions.ts` (marca `automated: true`)
- `src/app/api/whatsapp/webhook/route.ts` (reabre/desarquiva na entrada)

---

## Task 1: Rail funcional (migração 0027)

- [x] **Step 1: Migração**

`messages.automated boolean not null default false` + índice parcial `where automated`;
tabela `inbox_views (location_id, name, config jsonb, created_by)` com RLS membership e
`revoke` do `anon`. Aplicar e conferir:

```sql
select (select count(*) from information_schema.columns
          where table_name='messages' and column_name='automated') as col,
       (select count(*) from pg_policies where tablename='inbox_views') as policies;
```

- [x] **Step 2: Store de filtro**

`inbox-filters.ts` com `{scope, filter, sort, query}` + `activeViewId`. Qualquer ajuste
manual zera `activeViewId` (a visualização deixa de estar "aplicada"). `applyView`
restaura tudo de uma vez a partir dos padrões — assim visualização salva sem um campo
não herda lixo do estado atual.

- [x] **Step 3: Rail**

Busca global (popover): varre `messages` de trás para frente, dedupe por conversa,
completa com conversas cujo contato bate, ordena por data, corta em 25. Escopos
grupo/minhas/bot. Visualizações: salvar o snapshot atual, aplicar, excluir.

- [x] **Step 4: Marcar mensagem de automação**

`src/lib/automations/actions.ts`, ação `nota-interna`: `automated: true` no insert.
Qualquer agente de IA que passe a responder **precisa** marcar também.

---

## Task 2: Log e disparo das agendadas (migração 0028)

- [x] **Step 1: Migração**

`scheduled_by`, `schedule_status` (com `check` para os cinco valores), `dispatched_at`,
`schedule_error`; backfill dos agendamentos antigos como `pendente`; índice parcial das
pendentes e índice do log por empresa.

- [x] **Step 2: Gravar quem agendou**

`conversationActions.send` passa `scheduled_by` (do `auth.getUser()`) e
`schedule_status: "pendente"` quando há `scheduledFor`.

- [x] **Step 3: Motor**

`dispatchScheduledMessages()`: busca vencidas (limite 50), **claim por update
condicional** (`where schedule_status = 'pendente'`), entrega, grava resultado e sobe a
conversa na lista. WhatsApp pela Cloud API com as mesmas regras da rota interativa
(janela de 24h, limite diário); canal sem integração de envio = publicar na conversa.

- [x] **Step 4: Ligar no tick**

`/api/automations/tick` roda os dois com `Promise.allSettled` — uma falha não derruba a
outra. Resposta ganha a chave `scheduled`, que serve de sonda: se ela aparece no
`net._http_response`, o deploy chegou.

- [x] **Step 5: UI**

Aba **Agendadas** (contato, canal, mensagem, quem agendou, para quando, status, motivo
da falha, disparada em, cancelar) e resumo na bolha. O composer avisa na hora se agendar
WhatsApp sem canal conectado — cenário em que o disparo falha na certa.

---

## Task 3: Finalizar e arquivar (migração 0029)

- [x] **Step 1: Migração**

Quatro colunas (dois eixos) + três índices parciais (abertas, finalizadas, arquivadas).

- [x] **Step 2: Ações**

`conversationActions.close(id, done)` e `.archive(id, archived)` — gravam quem e quando,
ou limpam para desfazer.

- [x] **Step 3: UI**

Botão Finalizar/Reabrir e ícone Arquivar no cabeçalho; faixa de estado com quem/quando e
o caminho de volta; seletor de pilha no título da lista com contagem por pilha; ícone na
linha da conversa. A pilha entra no `InboxViewConfig` — visualizações salvas antes da
0029 assumem `"abertas"` no `mapView`.

- [x] **Step 4: Coerência dos números**

"Conversas abertas" nas Estatísticas contava tudo; passa a excluir finalizadas e
arquivadas e ganha o card "Finalizadas". O contador de não lidas também ignora conversa
fora da caixa.

- [x] **Step 5: Reabrir na entrada**

Webhook do WhatsApp zera `closed_at`/`archived_at` ao gravar mensagem de entrada.

---

## Handoff (Gabriel — fora do código)

- [x] **`private.automation_config.secret`** — estava com o placeholder e o tick
  respondia 401 a cada minuto. Restaurado copiando do `marketing_config` (mesmo
  `AUTOMATION_SECRET`), sem manusear o valor. Ver o post-mortem na spec.
- [ ] **Canal de WhatsApp** — sem `whatsapp_channels` ativo e vinculado à conversa,
  toda mensagem agendada de WhatsApp falha com "Conversa sem canal conectado". É o
  estado atual da conversa de teste.
- [ ] **Envs da Meta na Vercel** (`WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_VERIFY_TOKEN`) — pendentes desde a rodada do WhatsApp.

## Self-Review (autor do plano)

- **Cobertura da spec:** busca global → Task 1.3; escopo bot → 1.1+1.4; visualizações →
  1.1+1.3; log e disparo → Task 2; ciclo de vida → Task 3. ✓
- **Migrações aditivas e idempotentes**, cada uma conferida no `information_schema`. ✓
- **Ponto de atenção 1:** o filtro "com automação" nasce vazio (não há como marcar
  retroativamente). O estado vazio explica; se incomodar, a saída é uma automação rodar,
  não relaxar o critério.
- **Ponto de atenção 2:** o store carrega `messages` inteiro com `.select("*")` — o teto
  silencioso de 1000 linhas do PostgREST vale aqui também, como já valeu em Pagamentos.
  Com o volume atual não morde; quando morder, paginar como em `usePaymentSalesReport`.
- **Ponto de atenção 3:** acoplar o disparo ao tick das automações trocou um passo manual
  por uma dependência de saúde. Se o tick cair, as agendadas param junto e **sem alarme** —
  hoje só se percebe olhando `net._http_response`.
