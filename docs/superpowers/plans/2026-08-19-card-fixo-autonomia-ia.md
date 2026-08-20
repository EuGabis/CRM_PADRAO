# Card fixo por contato e autonomia da IA no funil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada contato tem um card fixo no funil; a IA cria em `Novo Lead` e move entre `Novo Lead`, `Em Negociação` e `Perdido`; o dono do card acompanha o atendente da conversa.

**Architecture:** três mudanças em `src/lib/crm/oportunidade-ia.ts` (allowlist de três etapas, busca do card em qualquer status, `status` derivado da etapa pela mesma função que o resto do projeto usa) mais a sincronia de `owner_id` na atribuição da conversa.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (service role no webhook, sessão do usuário nas telas)

**Spec:** `docs/superpowers/specs/2026-08-19-card-fixo-autonomia-ia-design.md`

## Global Constraints

- **`Fechado/Ganho` e `Proposta Enviada` são do humano.** A IA nunca escreve `won`. A garantia vive **no código**, nunca no prompt — pedir ao modelo é pedido, não regra.
- **`Fechado/Ganho` é terminal para a IA:** ela pode tirar card de `Proposta Enviada`, nunca de `Fechado/Ganho`.
- **Um card por contato.** A IA nunca cria um segundo card para o mesmo contato, em nenhum status.
- **A auto-resposta é best-effort e NUNCA pode quebrar o 200 do webhook.** Falha ao mexer no card não impede a resposta ao cliente.
- **Não reordene as guardas de custo** de `maybeAutoReply` nem acrescente chamada de modelo.
- **Nunca logar**: conteúdo de mensagem, dados do cliente final, credencial. Só `location_id` e o `code` do erro — a mensagem do Postgres ecoa o valor ofensor.
- **NÃO chame a OpenAI nem o gateway Evolution** durante a implementação.
- **O projeto NÃO tem test runner.** Não crie teste, não instale dependência. Verificação é `npx tsc --noEmit` e `npm run build`.
- **Não rode `dev` e `build` ao mesmo tempo.** Para buildar: pare o dev, apague `.next`.
- Shell é **PowerShell 5.1**: `&&` não existe, use `;`.
- **Base UI, não Radix.** **Zustand**: nunca filtrar/mapear/criar objeto dentro de selector — trava a página.
- Texto de UI e de evento em **pt-BR**.
- Commits em português. Commit + push na `main` a cada tarefa.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/crm/oportunidade-ia.ts` (modificar) | Allowlist de três etapas, card em qualquer status, `status` derivado. |
| `src/lib/ai/atendimento.ts` (modificar) | `INSTRUCAO_ATENDIMENTO` passa a descrever as três etapas. |
| `src/lib/data/repos/db/conversations.ts` (modificar) | Atribuir conversa sincroniza `owner_id` do card. |
| `AGENTS.md` (modificar) | Documentar a regra nova e o porquê da assimetria. |

---

### Task 1: Card fixo e as três etapas

**Files:**
- Modify: `src/lib/crm/oportunidade-ia.ts`
- Modify: `src/lib/ai/atendimento.ts`

**Interfaces:**
- Produces: `ETAPAS_DA_IA` com três entradas; `registrarAtendimento` mantém a mesma assinatura.

- [ ] **Step 1: Ampliar a allowlist para três etapas**

```ts
/**
 * O que a IA pode fazer no funil. Esta lista é a garantia — pedir ao modelo
 * "não mova para Ganho" no prompt é pedido, não regra: basta uma conversa
 * criativa para ele desobedecer.
 *
 * `Proposta Enviada` fica de fora porque quem envia proposta é o consultor,
 * muitas vezes fora do CRM — a IA não tem como saber que aconteceu.
 * `Fechado/Ganho` fica de fora porque é o número de venda da agência: "pode
 * fechar então!" não é uma venda, o cliente não pagou nem emitiu.
 *
 * `Perdido` entra: errar um perdido é recuperável (o consultor arrasta de
 * volta) e não infla receita. A assimetria entre ganho e perdido é
 * deliberada — não "conserte" achando que é inconsistência.
 */
const ETAPAS_DA_IA: Record<string, string> = {
  "novo-lead": "Novo Lead",
  "em-negociacao": "Em Negociação",
  "perdido": "Perdido",
};
```

O acesso continua por `Object.hasOwn` — chave herdada (`"constructor"`,
`"toString"`) não pode escapar da guarda.

- [ ] **Step 2: Achar o card em qualquer status**

Hoje a busca filtra `status = "open"`, e por isso um cliente que volta ganha card
novo. Tire esse filtro: a busca acha o card do contato dentro do funil da
empresa **em qualquer status**, e a IA move esse mesmo.

Se houver mais de um card do mesmo contato no funil (um humano pode ter criado
outro pela tela), pegue o mais recente por `created_at` — determinístico, com
`id` como desempate. **Nunca** crie um segundo.

- [ ] **Step 3: `Fechado/Ganho` é terminal para a IA**

Substitua a regra atual de "território" e de "só avança" por esta:

- se a etapa **atual** do card for `Fechado/Ganho`, a IA não move — `return`, com
  `console.info` registrando (só `locationId`);
- caso contrário, ela move para qualquer uma das três etapas da allowlist, em
  qualquer direção.

Uma conversa mal interpretada não pode apagar uma venda já registrada. Para
reabrir, o humano arrasta.

⚠️ A etapa atual pode não ser encontrada (`stage_id` órfão). Nesse caso **não
mova** — falha fechada, como já está hoje.

- [ ] **Step 4: `status` derivado da etapa, sem terceira cópia da regra**

`opportunities.status` alimenta o relatório. Mover para `Perdido` tem que gravar
`lost`; mover para `Novo Lead` ou `Em Negociação` tem que voltar para `open`.
Sem isso o card aparece em "Perdido" no Kanban e continua contando como aberto.

O projeto já deriva isso em dois lugares: `statusForStage` em
`src/lib/data/repos/db/pipeline.ts` e `statusForStageName` em
`src/lib/automations/actions.ts`. **Reutilize uma delas** em vez de escrever uma
terceira — três implementações da mesma regra divergem na primeira vez que
alguém renomear uma etapa. Se a que você escolher não estiver exportada,
exporte-a; não a duplique.

- [ ] **Step 5: A instrução do modelo passa a citar as três etapas**

Em `src/lib/ai/atendimento.ts`, `INSTRUCAO_ATENDIMENTO` hoje diz que
`etapa_sugerida` só pode ser `"novo-lead"`, `"em-negociacao"` ou `null`.
Acrescente `"perdido"`, e descreva quando usar: quando o cliente disser
claramente que desistiu, que já comprou em outro lugar ou que não tem interesse.

Deixe explícito que ela **não** deve sugerir etapa quando estiver só coletando
dados — sugerir `perdido` porque o cliente demorou a responder seria errado.

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/crm/oportunidade-ia.ts src/lib/ai/atendimento.ts
git commit -m "feat(ia): card fixo por contato e movimentacao em tres etapas"
```

---

### Task 2: O dono do card acompanha o atendente

**Files:**
- Modify: `src/lib/data/repos/db/conversations.ts`

**Interfaces:**
- Consumes: o mesmo formato de evento que `pipeline.ts` e `oportunidade-ia.ts` já gravam.

**Por que isto não é cosmético.** A RLS de `opportunities`
(`supabase/migrations/0039_pipelines_segmentacao.sql`) exige
`sees_all(location_id) or owner_id = auth.uid()`. Um vendedor com
`only_assigned = true` que recebe a conversa **não enxerga o card dela** — vê o
atendimento e não vê o negócio. Hoje passa despercebido porque o default é
`only_assigned = false`.

- [ ] **Step 1: Sincronizar na atribuição**

Na ação que grava `conversations.assigned_to`, atualize também o `owner_id` do
card daquele contato, no funil da empresa.

Vale nos dois sentidos: atribuir a alguém define o dono; remover a atribuição
deixa o card sem dono (`null`).

⚠️ Aqui as queries rodam com a **sessão do usuário** (RLS ativa), não com service
role. Um usuário que não enxerga o card não vai conseguir atualizá-lo — nesse
caso a falha é esperada e **não pode** derrubar a atribuição da conversa, que é a
ação que o usuário pediu.

- [ ] **Step 2: Evento na conversa**

Grave o evento no mesmo formato dos outros (`type: "event"`,
`direction: "out"`, `channel: "whatsapp"`, sem `channel_id`):
`Atendimento e card atribuídos a <nome>`. Sem nome disponível, `Atendimento
atribuído`.

⚠️ `direction` é **`"out"`**, nunca `"in"`. O trigger `messages_automation`
(`supabase/migrations/0007_automations.sql`) dispara a automação
`cliente-respondeu` para toda mensagem `direction = 'in'` — isso já foi corrigido
duas vezes nesta base; não reintroduza.

- [ ] **Step 3: Falha do evento não derruba a ação**

Igual aos outros gravadores: chamada sem `await`, `try/catch` próprio, e log só
com o **código** do erro — nunca o objeto inteiro, que ecoa o valor ofensor.

- [ ] **Step 4: Contato sem card**

Se o contato ainda não tem card, não crie um — apenas não sincronize. Criar card
a partir de uma atribuição de conversa encheria o funil de cards sem negócio.

- [ ] **Step 5: Type check e build**

```bash
npx tsc --noEmit
```

Com o dev parado e `.next` apagado:

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/repos/db/conversations.ts
git commit -m "feat(inbox): dono do card acompanha o atendente da conversa"
```

---

### Task 3: Documentação

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Atualizar a seção do atendimento natural**

O `AGENTS.md` hoje afirma, na seção "Atendimento natural pela IA", que a
allowlist "cobre só `Novo Lead` e `Em Negociação`" e que "Ganho e Perdido são
resultado de negócio, nunca interpretação de intenção". **Isso ficou
desatualizado** — documentação errada é pior que ausente.

Reescreva para o estado real: três etapas para a IA, duas para o humano, com o
motivo de cada lado e a explicação da assimetria (errar um perdido é
recuperável; errar um ganho infla receita).

- [ ] **Step 2: Documentar o card fixo**

Que a busca acha o card do contato **em qualquer status** e que a IA nunca cria
um segundo — e a consequência aceita: um card já perdido volta para negociação
quando o cliente reaparece.

- [ ] **Step 3: Documentar a sincronia de dono**

Que atribuir a conversa move o dono do card junto, e **por quê** (a RLS de
`opportunities` esconde card sem dono de quem tem `only_assigned`).

- [ ] **Step 4: Registrar o que continua fora do alcance do modelo**

Que a trava da imagem não mudou: autonomia no funil não é autonomia para
confirmar pagamento ao cliente final. Mover card é registro interno, que o
consultor corrige; confirmar PIX é afirmação ao cliente, que a agência não
desfaz.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: atualiza regras do funil da IA no AGENTS.md"
```

---

### Task 4: O funil atualiza sozinho

**Files:**
- Create: `supabase/migrations/0062_realtime_oportunidades.sql`
- Modify: `scripts/gerar-setup.ps1`, `AGENTS.md`
- Modify: `src/lib/data/repos/db/pipeline.ts`

**Por que esta tarefa existe.** Hoje o card criado pela IA só aparece depois de
`F5`. Duas causas somadas: `opportunities` **não está** na publicação
`supabase_realtime` (só `messages`, `conversations`, `payment_events` e
`payment_subscriptions` estão), e `pipeline.ts` **não tem inscrição nenhuma** de
Realtime.

O problema é maior que a IA: dois atendentes olhando o mesmo funil não veem o
card que o outro arrastou, e quem está com o funil aberto não vê lead chegando.

- [ ] **Step 1: Migração**

```sql
-- ============================================================
-- CRM ON — Realtime das oportunidades.
--
-- Sem isso o card criado ou movido não chega ao navegador: a tela do
-- funil carrega uma vez e só atualiza com F5. Vale para o card que a IA
-- cria pelo WhatsApp e para o card que outro atendente arrasta.
--
-- `add table` NÃO é idempotente (erra se a tabela já estiver na
-- publicação), por isso o guard.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'opportunities'
  ) then
    alter publication supabase_realtime add table public.opportunities;
  end if;
end $$;
```

⚠️ Confira o número livre em `AGENTS.md` e com `ls supabase/migrations/` antes —
o histórico deste projeto já tem números duplicados por não conferirem.

Registre em `scripts/gerar-setup.ps1` (parte 04, no fim), rode
`powershell -File scripts/gerar-setup.ps1`, e atualize o "Próximo número livre"
no `AGENTS.md`.

- [ ] **Step 2: Inscrição no repo do funil**

Em `src/lib/data/repos/db/pipeline.ts`, assine `postgres_changes` da tabela
`opportunities` (INSERT, UPDATE e DELETE) e reflita no store.

⚠️ **Chame `autenticarRealtime(supabase)` ANTES de `.subscribe()`** — ver
`src/lib/supabase/realtime.ts`. Sem isso o socket conecta como visitante
anônimo: a inscrição é **aceita**, o indicador acende, e a RLS filtra todas as
linhas, então nenhum evento chega. Esse bug já custou uma sessão inteira de
diagnóstico neste projeto; o helper existe justamente para não repetir.

Use `statusRealtime(...)` no callback do `subscribe`, como a inbox faz — engolir
`CHANNEL_ERROR` em silêncio foi a outra metade daquele bug.

- [ ] **Step 3: Não duplicar o que a própria tela acabou de fazer**

Quando o usuário arrasta um card, a tela já atualiza o store de forma otimista.
O evento do Realtime vai chegar logo depois com a mesma linha: trate como
atualização idempotente (substituir a oportunidade de mesmo `id`), nunca como
inserção nova — senão o card duplica na tela de quem o moveu.

- [ ] **Step 4: Zustand**

⚠️ Nunca filtrar, mapear, usar `.find` ou criar objeto/array dentro de um
selector — devolve referência nova a cada render e **trava a página**. Já
aconteceu neste projeto. Selecione o valor cru e derive com `useMemo`.

- [ ] **Step 5: Type check e build**

```bash
npx tsc --noEmit
```

Com o dev parado e `.next` apagado:

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations scripts/gerar-setup.ps1 supabase/setup src/lib/data/repos/db/pipeline.ts AGENTS.md
git commit -m "feat(pipeline): funil atualiza em tempo real"
```

---

## Verificação final (manual, pelo Gabriel)

1. Mandar "oi, queria uma passagem" → card criado em **Novo Lead**, evento na conversa.
2. Informar destino e datas, demonstrar interesse → card move para **Em Negociação**, com evento.
3. Dizer "desisti, vou deixar pra depois" → card move para **Perdido**, com evento.
4. Voltar a conversar com interesse → o **mesmo** card volta para Em Negociação. Conferir no funil que **não** existe um segundo card do contato.
5. **Dizer "pode fechar então!"** → a IA **não** move para Fechado/Ganho. *(o teste que mais importa)*
6. Arrastar o card para **Fechado/Ganho** na mão, depois mandar mensagem → a IA **não** tira o card de lá.
7. Atribuir a conversa a outro atendente → o card muda de dono e aparece o evento.

## Self-review

**Cobertura da spec:** allowlist de três (Task 1, Step 1), card em qualquer status (Step 2), `Fechado/Ganho` terminal (Step 3), `status` derivado sem terceira cópia (Step 4), instrução do modelo (Step 5), sincronia de dono e evento (Task 2), documentação (Task 3). Sem lacunas.

**Consistência:** os nomes de etapa (`Novo Lead`, `Em Negociação`, `Perdido`) são os mesmos da migração `0061` e os que a busca por nome usa. As chaves da allowlist (`novo-lead`, `em-negociacao`, `perdido`) são as mesmas que a `INSTRUCAO_ATENDIMENTO` do Step 5 enumera — se divergirem, a etapa é descartada em silêncio e o funil não anda.

**Fora de escopo, registrado:** bloquear duplicata criada por humano no banco; IA mover card de contato que não é o da conversa; histórico de status para relatório; desfazer movimento errado da IA.
