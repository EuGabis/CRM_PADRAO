# Conversas — caixa de entrada completa — Design Spec

> Torna funcionais os controles da caixa de entrada que existiam só como desenho:
> o rail de visualizações, o agendamento de mensagens e o ciclo de vida da conversa.
> Data: 2026-08-13. Convenções: `AGENTS.md`. Migrações **0027**, **0028** e **0029**.
> **Registrado depois da implementação** — as três partes já estão na `main` (PRs #56, #58, #60).

## Objetivo

O módulo Conversas era o mais "acabado" da UI e o mais enganoso: cinco botões no rail,
um relógio de agendamento e nenhuma forma de encerrar um atendimento. Quase nada disso
tinha dado por trás. Esta spec cobre as três rodadas que fecharam isso.

O fio condutor é o mesmo dos outros módulos: **controle que não faz nada é pior que
controle ausente**, porque o operador confia nele. A regra aplicada em toda decisão
abaixo: ou existe dado real por trás, ou o controle sai / vira estado honesto.

## Contexto — o que estava quebrado

Levantado a partir do código, não da documentação:

| Controle | O que fazia | Diagnóstico |
|---|---|---|
| Rail · lupa | `toast.info("busca global em breve")` | sem implementação |
| Rail · atribuídas a mim | `toast.info("filtro por atendente em breve")` | não havia responsável no banco |
| Rail · bot | `toast.info("filtro de conversas com IA em breve")` | não havia marcador de origem |
| Rail · visualizações | 4 nomes fixos no código (`ORGANIZAR`, `LEADS LUCAS`, ...) | mock puro |
| Composer · Programar | gravava `messages.scheduled_for` | **nada disparava** a mensagem |
| Finalizar / arquivar | não existia | — |

## Decisões

### 1. Dois eixos para o ciclo de vida, não um enum (0029)

`closed_at`/`closed_by` (atendimento resolvido) e `archived_at`/`archived_by` (fora de
vista) são colunas separadas. Um enum único (`aberta|finalizada|arquivada`) é mais
enxuto, mas **apaga informação**: arquivar uma conversa finalizada destruiria o registro
de que ela foi resolvida, e "quantas finalizei este mês?" ficaria sem resposta. Cada eixo
guarda quem e quando.

### 2. Mensagem de entrada reabre **e** desarquiva

No webhook do WhatsApp, uma mensagem do cliente zera os dois eixos. A alternativa —
respeitar o arquivamento — deixaria uma mensagem de cliente invisível na caixa. Perder
lead é pior do que desfazer um arquivamento.

### 3. O disparo das agendadas pega carona no tick existente (0028)

`dispatchScheduledMessages()` roda dentro de `/api/automations/tick`, que o `pg_cron` já
chama a cada minuto. Uma rota + job + segredo próprios custariam mais um passo manual em
produção e mais um segredo para rotacionar. O tick passa a ser "batimento de minuto do
servidor", não "batimento das automações".

> **Risco assumido e materializado:** o tick estava respondendo **401 havia dias** porque
> `private.automation_config.secret` tinha sido sobrescrito pelo placeholder (ver o
> post-mortem no fim deste documento). Pegar carona herda a saúde do carona.

### 4. "Conversas com automação" precisa de marcador, não de heurística

`messages.automated` (0027) é setado por quem escreve sem ser gente — hoje o motor de
automações na ação `nota-interna`; amanhã qualquer agente de IA que responder. Deduzir
"foi bot" por `internal = true` ou pela ausência de autor seria adivinhação.
Consequência aceita: o filtro nasce vazio, porque não há como marcar retroativamente —
o estado vazio explica isso em vez de fingir.

### 5. Busca do rail ≠ busca da lista

A busca da lista já filtra nome do contato e `lastMessagePreview`. Repetir isso no rail
seria o mesmo campo duas vezes. A do rail procura no **corpo de todas as mensagens** —
é o que a lista não alcança.

### 6. Estado de filtro fora do componente

Rail, lista e visualização salva mexem nos mesmos quatro campos (escopo, aba, ordenação,
busca) e a visualização precisa restaurar os quatro de uma vez. Store Zustand em
`src/components/inbox/inbox-filters.ts` em vez de prop drilling.

## Escopo entregue

**Rodada 1 — rail (migração 0027, PR #56)**
1. Busca global no corpo de todas as mensagens; clicar abre a conversa e marca lida.
2. Escopo "com automação" apoiado em `messages.automated`.
3. Visualizações salvas reais (tabela `inbox_views`): salvar o estado atual, aplicar, excluir.

**Rodada 2 — agendadas (migração 0028, PR #58)**
4. Log: `scheduled_by`, `schedule_status`, `dispatched_at`, `schedule_error`.
5. Disparo real com claim por update condicional; WhatsApp pela Cloud API respeitando
   janela de 24h e limite diário do canal.
6. Aba **Conversas → Agendadas** e resumo dentro da bolha da mensagem.

**Rodada 3 — ciclo de vida (migração 0029, PR #60)**
7. Finalizar/reabrir e arquivar/desarquivar, com quem e quando.
8. Seletor de pilha no título da lista (Abertas · Finalizadas · Arquivadas · Todas) com contagem.
9. Faixa de estado na conversa com o caminho de volta.

## Não-objetivos

- Atribuição automática (round-robin) — o toggle em Configurações segue sem backend.
- Fila de "Ações manuais" — depende de Automações com passos manuais.
- Agendamento de mídia/áudio — só texto por enquanto.
- Envio agendado em Instagram/Facebook/SMS — sem integração de envio; a "entrega" é
  publicar na conversa, como o composer já faz.

## Arquitetura

```
migrações   0027 messages.automated + inbox_views
            0028 messages.scheduled_by|schedule_status|dispatched_at|schedule_error
            0029 conversations.closed_at|closed_by|archived_at|archived_by

repo        db/conversations.ts  → mapeamento + conversationActions.close/archive,
                                   scheduleActions.cancel, inboxViewActions,
                                   useScheduledMessages, useAutomatedConversationIds
motor       lib/messages/scheduled.ts → dispatchScheduledMessages(), chamado pelo
                                   /api/automations/tick (mesmo minuto das automações)
UI          components/inbox/inbox-filters.ts  (store de filtro)
            components/inbox/views-rail.tsx    (busca global, escopos, visualizações)
            components/inbox/conversation-list.tsx (seletor de pilha, contagens)
            components/inbox/thread.tsx        (finalizar/arquivar, faixa, log na bolha)
            app/(app)/conversas/page.tsx       (aba Agendadas)
```

Ciclo da mensagem agendada: `pendente → enviando → enviada | falhou | cancelada`.
O claim (`update ... where schedule_status = 'pendente'`) garante que dois ticks
simultâneos não disparem a mesma mensagem — mesmo padrão do motor de automações.

## Segurança

- `inbox_views` com RLS no padrão membership (select/insert/update/delete por
  `private.user_locations()`), `revoke` do `anon`.
- Colunas novas em `messages`/`conversations` herdam a RLS das tabelas.
- O disparo roda com service role dentro de rota já protegida por `x-automation-secret`;
  nenhuma superfície nova exposta.

## Testes / verificação

- Sem runner → `npx tsc --noEmit` + `npm run build`.
- Banco: existência de colunas/tabela/policies/índices conferida por consulta ao
  `information_schema` após aplicar cada migração.
- Ponta a ponta observado em produção: no primeiro tique após o segredo ser corrigido,
  `{"processed":0,"errors":0,"scheduled":{"dispatched":0,"failed":1}}` — a mensagem
  pendente falhou com "Conversa sem canal de WhatsApp conectado", como previsto.

## Post-mortem — o 401 silencioso das automações

Descoberto ao validar o disparador (13/08). O tick respondia **401 a cada minuto**.
Causa: as migrações `0009` e `0011` traziam

```sql
on conflict (id) do update set tick_url = ..., secret = excluded.secret;
```

Rodar o arquivo de novo — coisa que a própria convenção do projeto incentiva, já que as
migrações são idempotentes — **sobrescrevia o segredo real com o placeholder do arquivo**.
Como o banco é um só para os dois Claudes, bastou uma re-execução em qualquer máquina.
Sintoma: nenhuma automação jamais rodou em produção; e o disparador novo teria nascido morto.

Correção aplicada:
1. `0009` e `0011` não tocam mais no `secret` no `on conflict` (só `tick_url`), com
   comentário registrando o incidente.
2. Restauração sem manusear o segredo — as duas rotas validam contra a **mesma**
   `AUTOMATION_SECRET`, e o `marketing_config` tinha o valor certo:
   ```sql
   update private.automation_config
      set secret = (select secret from private.marketing_config where id) where id;
   ```
3. Verificado: 401 → `200`.

Lição para a próxima integração: antes de acoplar em um motor existente, **olhar
`net._http_response`**, não só se o job existe em `cron.job`.

## Ordem de dependência

0027 → 0028 → 0029 (independentes entre si, mas foi a ordem de entrega). O disparo das
agendadas depende do `automation_config.secret` correto — sem isso o código está certo e
o efeito é zero.
