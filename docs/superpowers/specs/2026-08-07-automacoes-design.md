# Spec — Módulo de Automações real (Lito CRM)

**Data:** 2026-08-07
**Status:** aprovada pelo usuário
**Contexto:** o builder atual é visual/mock. Esta spec define automações que executam
sozinhas, sem ninguém com o navegador aberto.

## 1. Objetivo

Workflows que reagem a eventos do CRM e executam ações reais (tags, oportunidades,
tarefas, e-mail, espera, condições, webhook), com histórico de execução auditável.

## 2. Arquitetura (opção híbrida aprovada)

```
evento no banco ──trigger──> automation_runs (fila)
                                    │
              pg_cron (1 min) ──> pg_net POST ──> /api/automations/tick (Next, protegida)
                                                        │
                                              executa passos em TypeScript
                                              (Supabase service-side + Resend)
                                                        │
                                              automation_logs + próximo passo
```

**Por que:** a captura de eventos no banco é confiável (pega o evento venha do app,
da API ou de importação); a execução em TypeScript é fácil de manter e reaproveita
o Resend; e o agendamento pelo `pg_cron` não depende de plano pago da Vercel
(o cron do Hobby roda 1×/dia, o que inviabilizaria automações).

**Requisito de infra:** habilitar as extensões `pg_cron` e `pg_net` no Supabase
(gratuitas). O segredo `AUTOMATION_SECRET` autentica as chamadas do cron à rota.

## 3. Modelo de dados (migração 0007)

- `workflows` (existente) ganha:
  - `trigger_config jsonb` — configuração do gatilho (ex.: fase de origem/destino, tag)
  - `steps jsonb` — lista ordenada de passos com configuração real de cada um
- `automation_runs`
  - `id`, `location_id`, `workflow_id`, `contact_id`, `opportunity_id?`
  - `status`: `pending | running | waiting | done | failed | cancelled`
  - `current_step int`, `next_run_at timestamptz`, `payload jsonb`, `attempts int`
  - `event_key text` — chave de idempotência (evento+workflow+contato)
  - índice único parcial em `event_key` para não duplicar disparo
- `automation_logs`
  - `run_id`, `step_index`, `action_key`, `status` (`ok | skipped | error`),
    `message text`, `duration_ms int`, `created_at`

RLS: mesmo padrão das demais tabelas (membros da location leem; escrita do motor
acontece server-side com service role, fora da RLS).

## 4. Gatilhos (capturados por triggers no Postgres)

| Chave | Evento | Configuração |
|---|---|---|
| `contato-criado` | INSERT em contacts | — |
| `tag-adicionada` | UPDATE em contacts (tags) | tag específica (opcional) |
| `contato-atualizado` | UPDATE em contacts | campo observado |
| `oportunidade-criada` | INSERT em opportunities | pipeline |
| `fase-alterada` | UPDATE em opportunities (stage_id) | fase de origem / destino |
| `oportunidade-ganha` / `-perdida` | UPDATE status | pipeline |
| `cliente-respondeu` | INSERT em messages (direction=in) | canal |
| `compromisso-agendado` | INSERT em appointments | — |
| `aniversario` | verificação diária (pg_cron) | dias de antecedência |

## 5. Ações

**Executam de verdade:** `adicionar-tag`, `remover-tag`, `atualizar-campo`,
`atribuir-usuario`, `criar-oportunidade`, `mover-fase`, `criar-tarefa`,
`criar-compromisso`, `enviar-email` (Resend, com variáveis), `nota-interna`,
`esperar`, `condicao` (if/else), `webhook`.

**Configuradas, aguardando canal:** `enviar-whatsapp`, `enviar-sms` — registram no
log como `skipped` com motivo "canal não conectado"; passam a enviar quando o
WhatsApp for integrado, sem refazer fluxos.

**Variáveis nos textos:** `{{contato.nome}}`, `{{contato.email}}`, `{{contato.empresa}}`,
`{{oportunidade.valor}}`, `{{empresa.nome}}`.

## 6. Garantias operacionais

- **Idempotência:** `event_key` único impede disparo duplicado do mesmo evento.
- **Anti-loop:** um workflow não reentra no mesmo contato dentro de 5 minutos;
  teto de 50 passos por run.
- **Retentativas:** até 3 tentativas com recuo (1min, 5min, 15min) antes de `failed`.
- **DND:** contato com `dnd = true` pula ações de mensagem (log `skipped`).
- **Rascunho não executa:** só workflows `published` geram runs.
- **Segurança:** `/api/automations/tick` exige `AUTOMATION_SECRET` no header;
  a chave nunca vai ao navegador.

## 7. Interface

- **Builder:** cada nó abre painel de configuração real (destinatário, texto, tag,
  tempo de espera, condição). Publicar/Rascunho controla execução.
- **Execuções:** lista de runs (status, contato, início) e detalhe passo a passo
  com o log de cada ação.
- **Teste manual:** executa o fluxo contra um contato escolhido, sem esperar o gatilho.
- **Modelos prontos:** boas-vindas ao novo lead; follow-up sem resposta (2 dias);
  mover para Perdido (7 dias); parabéns por assinatura; lembrete de reunião 24h antes.

## 8. Verificação

- Criar contato de teste → conferir no banco que a tag foi aplicada e o log gravado.
- Mover oportunidade de fase → conferir run criado e ação executada.
- Passo `esperar` → conferir `status=waiting` e `next_run_at` correto.
- Webhook → apontar para endpoint de teste e conferir o POST.
- E-mail → enviar para o endereço da conta Resend.

## 9. Fora do escopo desta fase

Envio real por WhatsApp/SMS (depende de canal), ações de IA, split test,
"ir para" (loops explícitos), Meta Conversions API, editor visual com arrastar
nós livremente no canvas (a lista ordenada de passos permanece).
