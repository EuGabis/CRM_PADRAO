# Atendimento natural pela IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a IA atende em conversa natural, extrai os dados do cliente enquanto conversa, cria a oportunidade no funil e registra cada movimento como evento visível dentro da conversa.

**Architecture:** a chamada ao modelo passa a devolver, num JSON garantido pela API, a resposta ao cliente **e** os dados extraídos **e** a etapa sugerida — tudo numa chamada só, sem custo adicional. O que a IA pode fazer no funil é uma lista fechada no servidor, nunca uma instrução no prompt. Cada movimento vira uma mensagem `type = 'event'` na conversa, que a inbox já sabe renderizar.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (service role) · OpenAI Chat Completions com `response_format: json_object`

**Spec:** `docs/superpowers/specs/2026-08-19-atendimento-natural-ia-design.md`

## Global Constraints

- **`OPENAI_API_KEY` é global, na conta do dono da plataforma.** A ordem das guardas em `maybeAutoReply` (chave → módulo `whatsapp` → módulo `agentes-ia` → empresa suspensa → canal entregável → `bot_paused` → agente ativo → limite diário) é proteção de custo. **Não reordene, não acrescente chamada de modelo nova.**
- **Só modelos da allowlist** (`MODELOS_PERMITIDOS` em `src/lib/ai/openai.ts`). Modelo fora dela cai no padrão.
- **A auto-resposta é best-effort e NUNCA pode quebrar o 200 do webhook** — erro faz o gateway reentregar em laço.
- **Nunca logar**: conteúdo de mensagem, dados do cliente final, transcrição, URL assinada, token, chave. Erro do Postgres ecoa o valor ofensor — logue só `code`.
- **Nunca enviar JSON cru ao cliente final.** Se o parse falhar, silêncio naquela rodada é melhor.
- **NÃO chame a OpenAI nem o gateway Evolution** durante a implementação.
- **O projeto NÃO tem test runner.** Não existe `npm test`. Não crie teste, não instale dependência. Verificação é `npx tsc --noEmit` e `npm run build`.
- **Não rode `dev` e `build` ao mesmo tempo** — já corrompeu o `.next`. Para buildar: pare o dev, apague `.next`.
- Shell é **PowerShell 5.1**: `&&` não existe, use `;`.
- Texto de UI e de erro em **pt-BR**.
- **Base UI, não Radix**: triggers usam `render={<Button />}`, não `asChild`. **Zustand**: nunca filtrar/mapear/criar objeto dentro de selector — trava a página.
- Commits em português: `feat(ia): descrição`. Commit + push na `main` a cada tarefa.
- **Próximo número de migração livre: `0061`.**

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0061_funil_padrao.sql` (criar) | Funil padrão de 5 etapas para empresa nova. |
| `supabase/manual/ajustar-funil-5-etapas.sql` (criar) | Ajuste de empresa existente, com trava. Fora do setup. |
| `src/lib/ai/openai.ts` (modificar) | `chat` aceita `response_format`. |
| `src/lib/ai/atendimento.ts` (criar) | Contrato da resposta da IA, instrução de conversa natural, parse seguro. |
| `src/lib/crm/oportunidade-ia.ts` (criar) | Criar/mover oportunidade com allowlist, e escrever os eventos. |
| `src/lib/whatsapp/auto-reply.ts` (modificar) | Usar o contrato novo e acionar o registro. |
| `src/lib/data/repos/db/conversations.ts` e `pipeline.ts` (modificar) | Eventos das ações humanas. |
| `AGENTS.md` (modificar) | Regras novas + exemplo de personalidade natural. |

---

### Task 1: Funil padrão de 5 etapas

**Files:**
- Create: `supabase/migrations/0061_funil_padrao.sql`
- Create: `supabase/manual/ajustar-funil-5-etapas.sql`
- Modify: `scripts/gerar-setup.ps1`, `AGENTS.md`

**Interfaces:**
- Produces: os nomes de etapa que as Tasks 4 e 5 procuram por nome: `Novo Lead`, `Proposta Enviada`, `Em Negociação`, `Fechado/Ganho`, `Perdido`.

- [ ] **Step 1: Trocar o seed da empresa nova**

Leia `supabase/migrations/0053_criar_empresa.sql` — a função `private.prepare_client_company` insere hoje **nove** etapas de venda de SaaS (`TESTE GRÁTIS`, `ASSINOU`, `FILA DEMO`). Recrie a função com as cinco:

```sql
insert into public.stages (location_id, pipeline_id, name, color, position)
values
  (loc, pipe, 'Novo Lead',        '#3b82f6', 0),
  (loc, pipe, 'Proposta Enviada', '#f97316', 1),
  (loc, pipe, 'Em Negociação',    '#a855f7', 2),
  (loc, pipe, 'Fechado/Ganho',    '#22c55e', 3),
  (loc, pipe, 'Perdido',          '#ef4444', 4);
```

Mantenha **todo o resto** da função igual — ela faz validação, convite e limites, e é chamada pelo painel de plataforma. Copie o corpo atual e troque só o bloco das etapas.

- [ ] **Step 2: Comentar por que empresa existente não é tocada**

No topo da migração, deixe escrito: empresas que já existem **não** são alteradas de propósito; cada uma pode ter oportunidades nas etapas antigas, e reescrever em massa apagaria trabalho de vendas em silêncio.

- [ ] **Step 3: Escrever o ajuste manual, com trava**

`supabase/manual/ajustar-funil-5-etapas.sql`, recebendo o `location_id` no topo como variável. A ordem importa:

1. **Recusar se houver oportunidade em etapa que sairia.** Use `raise exception` com mensagem clara em pt-BR dizendo quantas oportunidades e em quais etapas — o dono precisa saber o que mover antes.
2. Só então: renomear/recolorir as que dá para aproveitar, criar as que faltam, apagar as que sobraram (agora comprovadamente vazias).

Se a pasta `supabase/manual/` não existir, crie-a com um `README.md` de uma linha dizendo que ali ficam scripts que o dono roda à mão e que **não** entram no `gerar-setup.ps1`.

- [ ] **Step 4: Registrar a migração e regerar o setup**

Acrescente `"0061_funil_padrao.sql"` ao fim da parte 04 em `scripts/gerar-setup.ps1` e rode:

```bash
powershell -File scripts/gerar-setup.ps1
```

⚠️ **Não** registre o script de `supabase/manual/` — ele não é migração.

- [ ] **Step 5: `AGENTS.md`**

Trocar "Próximo número livre: `0061`" por `0062`, e documentar o funil padrão novo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0061_funil_padrao.sql supabase/manual scripts/gerar-setup.ps1 supabase/setup AGENTS.md
git commit -m "feat(pipeline): funil padrao de cinco etapas"
```

---

### Task 2: `chat` aceita JSON garantido

**Files:**
- Modify: `src/lib/ai/openai.ts`

**Interfaces:**
- Produces: `chat(messages, opts)` passa a aceitar `opts.json?: boolean`. Quando `true`, envia `response_format: { type: "json_object" }` no corpo.

⚠️ **Três chamadores estão em produção** — `src/app/api/ai/chat/route.ts`, `src/app/api/ai/generate/route.ts` e `src/lib/whatsapp/auto-reply.ts`. Nenhum passa `json`, e o comportamento deles não pode mudar em nada.

- [ ] **Step 1: Acrescentar a opção**

Só quando `opts.json === true` o campo entra no corpo. Sem ele, o corpo enviado à API fica **byte a byte igual** ao de hoje. Não altere a allowlist de modelo, o `max_tokens`, o tratamento de erro nem o cálculo de `usage`.

- [ ] **Step 2: Confirmar que os chamadores não mudaram**

```bash
grep -rn "chat(" src/app/api/ai/ src/lib/whatsapp/auto-reply.ts
```

Cada chamada tem que continuar compilando sem alteração.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/openai.ts
git commit -m "feat(ia): chat aceita resposta em JSON garantido"
```

---

### Task 3: Contrato da resposta e parse seguro

**Files:**
- Create: `src/lib/ai/atendimento.ts`

**Interfaces:**
- Consumes: `chat` com `json: true` (Task 2).
- Produces:

```ts
export interface RespostaAtendimento {
  resposta: string;
  dados: Record<string, string>;
  etapaSugerida: string | null;
}

/** Instrução acrescentada ao system para conversa natural + formato. */
export const INSTRUCAO_ATENDIMENTO: string;

/** Devolve null quando o JSON veio inutilizável. Nunca lança. */
export function parseAtendimento(bruto: string): RespostaAtendimento | null;
```

- [ ] **Step 1: Escrever a instrução de atendimento**

Ela é acrescentada ao `system` **depois** do texto do agente (mesmo princípio da trava da imagem: o cliente configura a personalidade, e o formato não pode ser atropelado por ela). Precisa dizer, em pt-BR:

- conversar de forma natural, **sem menu numerado** e sem pedir os dados em bloco — a cliente recusou explicitamente o atendimento robótico;
- coletar ao longo da conversa: origem, destino, data de ida, data de volta, quantidade e tipo de passageiros;
- devolver **sempre** um objeto JSON com exatamente as chaves `resposta`, `dados` e `etapa_sugerida`;
- `resposta` é o texto que vai ao cliente — **nunca** mencionar JSON, campos ou o funil ali;
- `dados` traz só o que foi realmente informado; o que não souber, **omita** (não invente, não preencha com "não informado");
- `etapa_sugerida` só pode ser `"novo-lead"`, `"em-negociacao"` ou `null`.

- [ ] **Step 2: Escrever o parse**

```ts
export function parseAtendimento(bruto: string): RespostaAtendimento | null {
  try {
    const j = JSON.parse(bruto);
    const resposta = typeof j?.resposta === "string" ? j.resposta.trim() : "";
    if (!resposta) return null;          // sem texto não há o que enviar
    const dados: Record<string, string> = {};
    for (const [k, v] of Object.entries(j?.dados ?? {})) {
      if (typeof v === "string" && v.trim()) dados[k] = v.trim();
    }
    const etapa = typeof j?.etapaSugerida === "string" ? j.etapaSugerida
                : typeof j?.etapa_sugerida === "string" ? j.etapa_sugerida
                : null;
    return { resposta, dados, etapaSugerida: etapa };
  } catch {
    return null;
  }
}
```

Aceitar as duas grafias de `etapa_sugerida` é deliberado: o modelo alterna entre snake_case e camelCase, e perder a etapa por causa disso seria falha silenciosa.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/atendimento.ts
git commit -m "feat(ia): contrato e parse da resposta de atendimento"
```

---

### Task 4: Oportunidade com allowlist, e os eventos

**Files:**
- Create: `src/lib/crm/oportunidade-ia.ts`

**Interfaces:**
- Produces:

```ts
export async function registrarAtendimento(
  db: any,
  p: {
    locationId: string;
    conversationId: string;
    contactId: string;
    dados: Record<string, string>;
    etapaSugerida: string | null;
  },
): Promise<void>;
```

Best-effort: **nunca lança**. Quem chama (Task 5) não pode deixar o cliente sem resposta porque um insert falhou.

- [ ] **Step 1: A allowlist, no código**

```ts
/**
 * O que a IA pode fazer no funil. Esta lista é a garantia — pedir ao modelo
 * "não mova para Ganho" no prompt é um pedido, não uma regra: basta uma
 * conversa criativa para ele desobedecer.
 *
 * Ganho e Perdido são resultado de negócio, não estado de conversa. "pode
 * fechar então!" não é uma venda: o cliente não pagou nem emitiu. Se a
 * interpretação do modelo virasse número de venda, o relatório da agência
 * viraria ficção.
 */
const ETAPAS_DA_IA: Record<string, string> = {
  "novo-lead": "Novo Lead",
  "em-negociacao": "Em Negociação",
};
```

Etapa fora do mapa é **ignorada**, com `console.info` registrando a recusa (sem conteúdo da conversa).

- [ ] **Step 2: Acumular os dados no contato**

`contacts.custom_fields` é jsonb. Leia o valor atual, mescle, grave.

⚠️ **Campo vazio nunca sobrescreve valor já preenchido.** O cliente informa aos poucos — origem numa mensagem, data três mensagens depois — e a IA pode não repetir o que já sabe. Sem essa regra, cada rodada apagaria metade do que já foi coletado.

- [ ] **Step 3: Uma oportunidade por conversa**

Procure oportunidade aberta já ligada a este contato criada a partir desta conversa. Se existir, **atualize**; se não, crie na etapa resolvida pelo nome, com `source = 'IA'`.

Sem isso, cada mensagem do cliente vira um card novo e o funil vira lixo em uma tarde.

Resolva a etapa **por nome** dentro do funil da empresa (`stages.name`), não por posição — o dono pode reordenar.

- [ ] **Step 4: Escrever o evento na conversa**

A inbox **já renderiza** `messages.type = 'event'` (`PipelineEvent`, em `src/components/inbox/thread.tsx`) — hoje nada no código real cria esses registros, só os dados de exemplo. O `body` é exibido como texto corrido numa pílula centralizada.

Grave um evento a cada mudança real, em pt-BR e dizendo **quem** fez:

- na criação: `Oportunidade criada em Novo Lead pela IA`
- na movimentação: `Oportunidade movida de Novo Lead → Em Negociação pela IA`

Campos do insert: `location_id`, `conversation_id`, `direction: "in"`, `type: "event"`, `channel: "whatsapp"`, `body`. **Não** grave evento quando nada mudou — repetir o mesmo evento a cada mensagem polui a conversa e esconde o que importa.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/crm/oportunidade-ia.ts
git commit -m "feat(ia): oportunidade com allowlist de etapa e evento na conversa"
```

---

### Task 5: Ligar no atendimento

**Files:**
- Modify: `src/lib/whatsapp/auto-reply.ts`

**Interfaces:**
- Consumes: `INSTRUCAO_ATENDIMENTO`, `parseAtendimento` (Task 3); `registrarAtendimento` (Task 4); `chat(..., { json: true })` (Task 2).

⚠️ Leia o arquivo inteiro antes. Ele está em produção e tem uma ordem de guardas que é **proteção de custo** — não reordene nada.

- [ ] **Step 1: Acrescentar a instrução ao system**

Depois do texto do agente e **antes** da `TRAVA_IMAGEM`, que continua sendo a última (uma personalidade assertiva não pode atropelar nenhuma das duas, e a trava é a mais crítica).

- [ ] **Step 2: Pedir JSON e tratar a falha**

Chame `chat(messages, { model, json: true })` e passe o texto por `parseAtendimento`.

Se vier `null`: **tente uma vez mais**, e se falhar de novo, saia com `sair(locationId, "resposta-json-invalida")` **sem enviar nada**. Nunca mande o texto cru — se o modelo devolveu JSON quebrado, o cru é chave e chave de JSON, e isso iria para o WhatsApp do cliente final da sua cliente.

- [ ] **Step 3: Enviar só a `resposta`**

O que vai para `enviarTexto` e o que é gravado como mensagem de saída é **apenas** `resposta.resposta`. `dados` e `etapaSugerida` nunca aparecem para o cliente.

- [ ] **Step 4: Registrar, sem bloquear a resposta**

Chame `registrarAtendimento` **depois** de a resposta ter sido enviada e gravada. Falha ali não pode impedir o atendimento — o cliente recebe a resposta e a falha vai para o log. O contrário (deixar o cliente sem resposta porque um insert falhou) é pior para quem está do outro lado.

Você precisa do `contactId`; o webhook já resolve o contato antes de chamar `maybeAutoReply` — acrescente-o ao objeto de parâmetros e ajuste os **dois** chamadores (webhook da Meta e da Evolution) no mesmo commit, para não deixar chamador defasado em produção.

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
git add src/lib/whatsapp/auto-reply.ts src/app/api/whatsapp/webhook/route.ts src/app/api/whatsapp/evolution/webhook/route.ts
git commit -m "feat(ia): atendimento natural com extracao e registro no funil"
```

---

### Task 6: Eventos das ações humanas, e documentação

**Files:**
- Modify: `src/lib/data/repos/db/conversations.ts`
- Modify: `src/lib/data/repos/db/pipeline.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: o mesmo formato de evento da Task 4.

O dono pediu o histórico completo dentro da conversa, não só o da IA. Sem os eventos humanos, a linha do tempo conta metade da história e passa a impressão de que só a IA mexe no funil.

- [ ] **Step 1: Conversa encerrada**

Em `conversations.ts`, na ação que grava `closed_at`/`closed_by`, escreva também um evento: `Conversa encerrada por <nome>`. Se não houver nome disponível, use `Conversa encerrada`.

- [ ] **Step 2: Card movido no funil**

Em `pipeline.ts`, na ação que muda a etapa de uma oportunidade, escreva o evento na conversa ligada àquele contato: `Oportunidade movida de <origem> → <destino> por <nome>`.

⚠️ Se a oportunidade não tiver conversa correspondente, **não** crie conversa nova para pendurar o evento — apenas não registre. Criar conversa a partir de um arrastar de card encheria a inbox de conversas vazias.

- [ ] **Step 3: Anotação**

A inbox já tem mensagem interna (`messages.internal`). Confirme lendo o composer se a anotação já é gravada assim; se for, **não** duplique como evento — o histórico já a mostra. Se não for, registre-a como evento `Anotação: <texto>`. Diga no relatório qual dos dois casos você encontrou.

- [ ] **Step 4: Documentar no `AGENTS.md`**

Na seção da Evolution/IA, acrescente:

- que a IA responde em JSON (`resposta`/`dados`/`etapa_sugerida`) e que **JSON cru nunca vai ao cliente**;
- que a allowlist de etapas vive no **código** e por quê (o prompt é pedido, não garantia);
- que `custom_fields` acumula e campo vazio não sobrescreve;
- que os eventos da conversa usam `type = 'event'`, que a inbox já renderiza.

- [ ] **Step 5: Exemplo de personalidade natural**

Acrescente ao `AGENTS.md` um exemplo pronto de personalidade em conversa natural, para a cliente partir de algo que funciona em vez de uma caixa vazia. Deixe claro no texto que **o tom é responsabilidade de quem escreve a personalidade** — o código garante a coleta dos dados, não o tom.

- [ ] **Step 6: Type check e build**

```bash
npx tsc --noEmit
```

Com o dev parado e `.next` apagado:

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/repos/db/conversations.ts src/lib/data/repos/db/pipeline.ts AGENTS.md
git commit -m "feat(inbox): eventos das acoes humanas na conversa"
```

---

## Verificação final (manual, pelo Gabriel)

1. Aplicar a `0061` e, para a GAABTUR, rodar `supabase/manual/ajustar-funil-5-etapas.sql`.
2. Escrever a personalidade natural no agente principal, marcá-lo ativo.
3. Do celular: "oi, queria uma passagem" → a IA responde **sem menu numerado**.
4. Informar origem, destino e data ao longo da conversa → aparece o evento
   `Oportunidade criada em Novo Lead pela IA` na conversa, e o card no funil.
5. Abrir o contato → origem, destino e data estão nos campos personalizados.
6. Demonstrar intenção clara → evento de movimentação para **Em Negociação**.
7. **Dizer "pode fechar então!"** → a IA **não** move para Fechado/Ganho.
   *(Este é o teste que mais importa.)*
8. Arrastar o card no funil → o evento aparece na conversa com o nome da pessoa.
9. Encerrar a conversa → evento com quem encerrou.

## Self-review

**Cobertura da spec:** chamada única com JSON (Tasks 2 e 3), allowlist no código (Task 4), uma oportunidade por conversa (Task 4, Step 3), `custom_fields` sem sobrescrever (Task 4, Step 2), eventos da IA (Task 4, Step 4), eventos humanos (Task 6), funil padrão e ajuste com trava (Task 1), nunca mandar JSON cru (Task 5, Step 2), exemplo de personalidade (Task 6, Step 5). Sem lacunas.

**Consistência de tipos:** `RespostaAtendimento` tem `etapaSugerida` (camelCase) na Task 3 e é consumida assim na Task 5; o parse aceita as duas grafias vindas do modelo. `registrarAtendimento` recebe `etapaSugerida: string | null` na Task 4 e é chamada com esse tipo na Task 5. Os nomes de etapa da Task 1 são os mesmos que a Task 4 procura.

**Fora de escopo, registrado:** IA mover para Proposta Enviada, Ganho ou Perdido; IA enviar proposta ou cotação; funil configurável pela tela da plataforma; auto-resposta com mídia no canal Meta; relatório de desempenho da IA.
