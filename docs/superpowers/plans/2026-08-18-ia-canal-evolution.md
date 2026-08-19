# IA no canal Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a auto-resposta com IA funciona no canal Evolution, entende áudio e foto recebidos, e mensagens agendadas e templates passam a respeitar o provedor.

**Architecture:** um helper único de envio (`enviarTexto`) resolve o provedor e substitui as chamadas diretas à Cloud API na auto-resposta e nas agendadas. O miolo da auto-resposta não muda — só a linha do envio e o ponto de entrada. Áudio vira texto por Whisper e foto é interpretada por visão, ambos **depois** de todas as guardas de custo.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (service role + Storage) · OpenAI (Chat Completions + Whisper) · Evolution API v2.3.7

**Spec:** `docs/superpowers/specs/2026-08-18-ia-canal-evolution-design.md`

## Global Constraints

- **O gateway Evolution hospeda a instância `Teste`, de OUTRO projeto do dono, com número real.** Nenhuma tarefa pode ler, alterar ou apagar essa instância nem qualquer outra que o CRM não tenha criado. **Nenhum agente deve chamar o gateway** — tudo que é preciso já está documentado.
- **O projeto NÃO tem test runner.** Não existe `npm test`. Não crie teste, não instale dependência. Verificação é `npx tsc --noEmit` e `npm run build`.
- **Não rode `dev` e `build` ao mesmo tempo** — já corrompeu o `.next` e travou o build com lock. Para buildar: pare o dev e apague `.next`.
- Shell é **PowerShell 5.1**: `&&` não existe, use `;`.
- **A auto-resposta é best-effort e NUNCA pode quebrar o 200 do webhook** — resposta de erro faz o gateway reentregar em laço.
- **Nunca logar**: conteúdo de mensagem, transcrição, nome de arquivo do cliente, URL assinada, `evolution_token`, `webhook_secret`, chave da OpenAI. Erro do Postgres ecoa o valor ofensor — logue só `code`.
- **`evolution_token` e `evolution_instance` não são legíveis pela sessão do usuário** desde a `0058`. Rota autenticada busca com `createAdminClient()` escopado por id já validado pela RLS. O webhook já roda com service role.
- `OPENAI_API_KEY` e `EVOLUTION_API_KEY` são **globais**, na conta do dono da plataforma. A ordem das guardas é o que protege o custo dele.
- Texto de UI e de erro em **pt-BR**.
- Commits em português: `feat(whatsapp): descrição`. Commit + push na `main` a cada tarefa.
- **Próximo número de migração livre: `0060`.**

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0060_transcricao_audio.sql` (criar) | Coluna `messages.media_transcript`. |
| `src/lib/whatsapp/enviar.ts` (criar) | `enviarTexto` — resolve provedor e entrega. Só transporte. |
| `src/lib/ai/openai.ts` (modificar) | `chat` passa a aceitar conteúdo com partes (texto + imagem). |
| `src/lib/ai/transcrever.ts` (criar) | `transcreverAudio` — Whisper. |
| `src/lib/whatsapp/auto-reply.ts` (modificar) | Provedor, mídia, e log do motivo de saída. |
| `src/app/api/whatsapp/evolution/webhook/route.ts` (modificar) | Passa a chamar `maybeAutoReply`. |
| `src/lib/messages/scheduled.ts` (modificar) | Janela de 24h só no Meta; envio pelo helper. |
| `src/components/inbox/composer.tsx` e `bulk-template-dialog.tsx` (modificar) | Esconder template em canal Evolution. |
| `AGENTS.md` (modificar) | Documentar o motor de IA e os tetos. |

---

### Task 1: Coluna da transcrição

**Files:**
- Create: `supabase/migrations/0060_transcricao_audio.sql`
- Modify: `scripts/gerar-setup.ps1`, `AGENTS.md`

**Interfaces:**
- Produces: coluna `public.messages.media_transcript text` (nullable), lida pelas Tasks 5 e 6.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================
-- CRM ON — Transcrição de áudio recebido.
--
-- Guarda o texto que o Whisper extraiu do áudio, na própria linha da
-- mensagem. Dois motivos, os dois importam:
--   1. o atendente lê o que o cliente disse sem precisar ouvir;
--   2. reentrega do mesmo evento pelo gateway não paga transcrição de novo
--      (a OPENAI_API_KEY é global, na conta do dono da plataforma).
--
-- Não precisa de grant: a 0058 só revogou select de TABELA em
-- whatsapp_channels e google_ads_connections. `messages` mantém o grant de
-- tabela da 0055, então a coluna nova já nasce legível por authenticated —
-- e ela não é segredo: é o conteúdo que o cliente mandou, que o atendente
-- já pode ver.
--
-- Idempotente.
-- ============================================================
alter table public.messages
  add column if not exists media_transcript text;

comment on column public.messages.media_transcript is
  'Texto extraído de áudio recebido (Whisper). Null quando não houve transcrição.';
```

- [ ] **Step 2: Confirmar que a suposição sobre o grant é verdadeira**

Não confie no comentário que você acabou de escrever. Abra
`supabase/migrations/0058_colunas_secretas.sql` e confirme que ele **não** toca
em `public.messages`. Se tocar, a migração precisa de um `grant select
(media_transcript)` e o comentário está errado — corrija os dois.

- [ ] **Step 3: Registrar no gerador do setup**

Acrescente `"0060_transcricao_audio.sql"` ao fim da parte 04 em
`scripts/gerar-setup.ps1` e rode:

```bash
powershell -File scripts/gerar-setup.ps1
```

O script falha de propósito se alguma migração ficar sem classificar.

- [ ] **Step 4: Atualizar o AGENTS.md**

Trocar "Próximo número livre: `0060`" por `0061`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0060_transcricao_audio.sql scripts/gerar-setup.ps1 supabase/setup AGENTS.md
git commit -m "feat(whatsapp): coluna de transcricao de audio"
```

---

### Task 2: Helper único de envio

**Files:**
- Create: `src/lib/whatsapp/enviar.ts`

**Interfaces:**
- Produces:

```ts
export type ResultadoEnvio =
  | { ok: true; waMessageId: string | null }
  | { ok: false; motivo: string };

export async function enviarTexto(
  db: any,
  channelId: string,
  paraE164: string,
  texto: string,
): Promise<ResultadoEnvio>;
```

Consumido pelas Tasks 4 e 7.

Leia antes: `src/app/api/whatsapp/send/route.ts` — a rota interativa já bifurca
por provedor e é o padrão a copiar (inclusive a busca do token).

- [ ] **Step 1: Escrever o helper**

Ele faz **uma** coisa: entregar o texto pelo provedor certo.

**Não** aplica limite diário nem janela de 24h — essas regras pertencem a quem
chama, porque cada chamador as aplica em momento diferente (a auto-resposta
antes de gastar a OpenAI; a agendada na hora do disparo). Helper que decide
regra de negócio esconde a regra de quem precisa vê-la.

Estrutura obrigatória:

```ts
// `db` é o cliente service role (webhook e cron não têm sessão de usuário).
// As colunas secretas (evolution_instance/evolution_token) só são legíveis
// por ele desde a 0058.
const { data: channel } = await db
  .from("whatsapp_channels")
  .select("id, provider, phone_number_id, evolution_instance, evolution_token, connection_state, active")
  .eq("id", channelId)
  .maybeSingle();
if (!channel) return { ok: false, motivo: "canal-nao-encontrado" };
if (!channel.active) return { ok: false, motivo: "canal-inativo" };

if (channel.provider === "evolution") {
  if (channel.connection_state !== "open") return { ok: false, motivo: "desconectado" };
  if (!channel.evolution_instance || !channel.evolution_token) {
    return { ok: false, motivo: "sem-instancia" };
  }
  // sendText do cliente Evolution: usa o TOKEN DA INSTÂNCIA, nunca a chave global
} else {
  // provider nulo ou "meta" cai aqui — default seguro para canal legado
}
```

⚠️ O roteamento é `if (provider === "evolution")` com o Meta no `else`. **Nunca**
`if (provider === "meta")`: canal legado tem `provider` nulo no banco e precisa
cair no ramo Meta.

O `motivo` é um código curto e estável (`"desconectado"`, `"canal-inativo"`, …),
não a mensagem crua do provedor — o erro cru da Evolution ecoa o nome da
instância no path.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Esperado: `No errors found`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/enviar.ts
git commit -m "feat(whatsapp): helper unico de envio por provedor"
```

---

### Task 3: O cliente da OpenAI aceita imagem

**Files:**
- Modify: `src/lib/ai/openai.ts`

**Interfaces:**
- Produces: `chat` aceita, além de `content: string`, a forma com partes:

```ts
type ParteConteudo =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type MensagemChat = {
  role: "system" | "user" | "assistant";
  content: string | ParteConteudo[];
};
```

Consumido pela Task 6.

⚠️ **Os chamadores atuais não podem quebrar.** `src/app/api/ai/chat/route.ts`,
`src/app/api/ai/generate/route.ts` e `src/lib/whatsapp/auto-reply.ts` passam
`content` string. A forma string continua válida e com o mesmo comportamento.

- [ ] **Step 1: Alargar o tipo**

Só o tipo do parâmetro muda; o corpo enviado à API já é o `messages` repassado,
então conteúdo com partes trafega sem tradução. Não altere o tratamento de erro,
o `defaultModel()` nem o cálculo de `usage`.

- [ ] **Step 2: Confirmar que nada quebrou nos chamadores**

```bash
grep -rn "chat(" src/app/api/ai/ src/lib/whatsapp/auto-reply.ts
```

Cada chamada tem que continuar compilando sem mudança. Se alguma precisou ser
alterada, o tipo ficou estreito demais — corrija o tipo, não o chamador.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/openai.ts
git commit -m "feat(ia): cliente da OpenAI aceita conteudo com imagem"
```

---

### Task 4: Auto-resposta no canal Evolution, com log do motivo

**Files:**
- Modify: `src/lib/whatsapp/auto-reply.ts`
- Modify: `src/app/api/whatsapp/evolution/webhook/route.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts` (só a chamada, ver Step 3)

**Interfaces:**
- Consumes: `enviarTexto` (Task 2).
- Produces: `maybeAutoReply(db, p)` onde `p` deixa de ter `phoneNumberId` e passa
  a ter apenas `{ locationId, conversationId, channelId, toPhone, dailyLimit }`.

⚠️ **O caminho Meta está em produção.** Todas as regras existentes ficam iguais:
guarda de plano, empresa suspensa, `bot_paused`, agente principal ativo, limite
diário, últimas 10 mensagens como contexto, e a montagem do prompt.

- [ ] **Step 1: Trocar o envio pelo helper**

Remova o parâmetro `phoneNumberId` e a importação de `sendText` da Cloud API.
Onde hoje está:

```ts
waResp = await sendText(p.phoneNumberId, p.toPhone, reply);
```

passe a usar `enviarTexto(db, p.channelId, p.toPhone, reply)`, e obtenha o
`waMessageId` do resultado. A gravação da mensagem de saída e a atualização da
conversa continuam exatamente como estão.

- [ ] **Step 2: Registrar o motivo de cada saída**

Hoje toda saída é um `return` mudo. É o caminho mais caro do produto: se parar
de funcionar, não sobra rastro em lugar nenhum.

Crie uma função local e use-a em **todos** os pontos de saída:

```ts
function sair(locationId: string, motivo: string): void {
  // NUNCA logar conteúdo da conversa, transcrição ou credencial — só o motivo
  // e a empresa. Este log é a única forma de descobrir que a IA parou.
  console.info(`[auto-reply] saída: ${motivo} · location ${locationId}`);
}
```

Motivos, um por ponto de saída existente: `"sem-openai-key"`, `"modulo-bloqueado"`,
`"empresa-suspensa"`, `"bot-pausado"`, `"sem-agente-ativo"`, `"limite-diario"`,
`"openai-falhou"`, `"envio-falhou"`, `"resposta-vazia"`.

No caso de `"envio-falhou"`, inclua o `motivo` que o helper devolveu.

- [ ] **Step 3: Ajustar o chamador da Meta**

`src/app/api/whatsapp/webhook/route.ts:238` passa `phoneNumberId`. Remova
**apenas** essa linha do objeto — todos os outros campos continuam.

- [ ] **Step 4: Chamar do webhook da Evolution**

Em `src/app/api/whatsapp/evolution/webhook/route.ts`, depois de gravar a
mensagem de entrada, chame `maybeAutoReply` no mesmo ponto em que o webhook da
Meta chama — **só para mensagem de texto** (mídia entra nas Tasks 5 e 6).

A chamada tem que estar dentro do `try` que já protege o processamento da
mensagem: qualquer falha aqui **não pode** impedir o 200.

- [ ] **Step 5: Type check e build**

```bash
npx tsc --noEmit
```

Depois, com o dev parado e `.next` apagado:

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/auto-reply.ts src/app/api/whatsapp/evolution/webhook/route.ts src/app/api/whatsapp/webhook/route.ts
git commit -m "feat(whatsapp): auto-resposta no canal Evolution e log do motivo de saida"
```

---

### Task 5: Áudio recebido vira texto

**Files:**
- Create: `src/lib/ai/transcrever.ts`
- Modify: `src/lib/whatsapp/auto-reply.ts`

**Interfaces:**
- Consumes: coluna `media_transcript` (Task 1); `maybeAutoReply` (Task 4).
- Produces:

```ts
export async function transcreverAudio(
  bytes: ArrayBuffer,
  nomeArquivo: string,
): Promise<string>;
```

Lança em falha — quem chama trata.

- [ ] **Step 1: Escrever o transcritor**

Endpoint: `POST https://api.openai.com/v1/audio/transcriptions`,
`multipart/form-data`, campos `file` e `model` (`whisper-1`), header
`Authorization: Bearer <OPENAI_API_KEY>`. Siga o estilo de
`src/lib/ai/openai.ts` — mesma leitura de chave, mesmo formato de erro.
**A chave nunca aparece em log.**

- [ ] **Step 2: Acionar a transcrição na auto-resposta, DEPOIS das guardas**

Esta ordem é requisito de custo, não estilo: transcrever antes das guardas
gastaria Whisper com empresa suspensa, com módulo bloqueado, com o bot pausado
ou com o limite estourado.

Quando a mensagem de entrada for `type = "audio"`:

```ts
// Já transcrita? Reentrega do gateway não paga de novo.
if (msg.media_transcript) {
  texto = msg.media_transcript;
} else {
  // Teto: sem ele, um áudio longo de um cliente final vira custo aberto na
  // conta do dono da plataforma.
  // segundos > 300 ou bytes > 20 MB -> trata como mídia não interpretada.
  // Caso contrário: baixa do bucket conversation-media com service role,
  // transcreve, grava em media_transcript, e usa como texto do cliente.
}
```

O teto de duração usa o campo `seconds` do payload quando existir; na ausência
dele, use só o tamanho em bytes (`media_size`).

- [ ] **Step 3: Falha de transcrição não cancela a resposta**

Se o download ou o Whisper falharem, a IA responde como se fosse mídia não
interpretada — nunca fica muda. Registre o motivo (`"transcricao-falhou"`) com a
mesma função `sair` da Task 4, **sem** o conteúdo do áudio nem o nome do
arquivo.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/transcrever.ts src/lib/whatsapp/auto-reply.ts
git commit -m "feat(ia): transcricao de audio recebido"
```

---

### Task 6: Foto interpretada, com a trava

**Files:**
- Modify: `src/lib/whatsapp/auto-reply.ts`
- Modify: `src/app/api/whatsapp/evolution/webhook/route.ts`

**Interfaces:**
- Consumes: `chat` com partes (Task 3).

- [ ] **Step 1: Mandar a imagem junto da conversa**

Quando a mensagem de entrada for `type = "image"`, gere uma **URL assinada de
curta duração** (120 segundos) do objeto no bucket `conversation-media` com a
service role, e inclua-a na mensagem do usuário como parte `image_url`, junto da
legenda quando houver. Nenhum byte passa pela nossa função.

**Nunca** logue a URL assinada.

- [ ] **Step 2: A trava, acrescentada DEPOIS do texto do agente**

Esta é a parte que não pode falhar. O `system` hoje é montado a partir da
personalidade, objetivo e informações do agente — que **o cliente configura**.
A instrução abaixo é acrescentada ao fim, para vencer qualquer personalidade:

```ts
const TRAVA_IMAGEM =
  "Você NUNCA confirma pagamento, valor, comprovante, documento ou identidade " +
  "a partir de uma imagem. Se a imagem parecer comprovante, boleto, nota, " +
  "documento ou algo que peça confirmação de valor, responda que um atendente " +
  "humano vai conferir e não afirme nada sobre o conteúdo.";
```

Ela só entra quando há imagem na conversa. Se viesse antes do texto do agente,
uma personalidade mais assertiva poderia atropelá-la.

Sem isso o caso clássico acontece: o cliente manda um comprovante de PIX e a IA
responde "pagamento confirmado", tendo apenas lido uma imagem, sem consultar
nada.

- [ ] **Step 3: Vídeo e documento não são interpretados**

Para `type = "video"` e `type = "file"`, a IA responde reconhecendo o
recebimento e **não** pausa o bot — pausar deixaria a conversa muda para sempre
depois de um único anexo.

- [ ] **Step 4: Chamar a auto-resposta para mídia no webhook da Evolution**

A Task 4 ligou a auto-resposta só para texto. Agora ela vale também para as
mensagens de mídia gravadas pelo webhook. Mensagem cuja mídia **falhou** (sem
`media_path`) segue o caminho de mídia não interpretada.

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
git add src/lib/whatsapp/auto-reply.ts src/app/api/whatsapp/evolution/webhook/route.ts
git commit -m "feat(ia): interpretacao de foto recebida com trava de valores"
```

---

### Task 7: Agendadas e templates por provedor, e documentação

**Files:**
- Modify: `src/lib/messages/scheduled.ts`
- Modify: `src/components/inbox/composer.tsx`
- Modify: `src/components/inbox/bulk-template-dialog.tsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `enviarTexto` (Task 2).

- [ ] **Step 1: Janela de 24h só no canal Meta**

`src/lib/messages/scheduled.ts:177` aplica a janela a todo canal. Em canal
Evolution ela não existe, e hoje recusa todo agendamento com "janela de 24h
fechada — reenvie por template": um erro sobre uma regra que não se aplica.

Acrescente `provider` ao `select` do canal e envolva a checagem da janela em
`if (channel.provider !== "evolution")`. O limite diário continua valendo nos
dois, onde já está.

- [ ] **Step 2: Envio pelo helper**

Troque `sendText(channel.phone_number_id, to, msg.body)` por
`enviarTexto(db, channel.id, to, msg.body)`. O `error` devolvido em falha
continua sendo texto legível para o usuário — traduza o `motivo` do helper para
uma frase em pt-BR (ex.: `"desconectado"` vira "WhatsApp desconectado na hora do
disparo — reconecte o canal").

- [ ] **Step 3: Esconder template em canal Evolution**

Template é conceito da Meta. Leia como `composer.tsx` e
`bulk-template-dialog.tsx` descobrem o canal da conversa e esconda a opção de
template quando o provedor for `evolution`, em vez de deixar o usuário montar um
template que volta com "Mensagem vazia" — erro que não explica nada.

⚠️ Base UI, **não** Radix: triggers usam `render={<Button />}`, não `asChild`;
`SelectValue` precisa de children explícito; `onValueChange` recebe
`string | null`.

⚠️ Zustand: nunca filtrar, mapear ou criar objeto/array dentro de um selector —
devolve referência nova a cada render e trava a página. Selecione o valor cru e
derive com `useMemo`.

- [ ] **Step 4: Documentar no AGENTS.md**

Na seção "WhatsApp não oficial (Evolution)", acrescente: que a auto-resposta
funciona nos dois provedores e passa pelo `enviarTexto`; a ordem das guardas e
por que ela é de custo; os tetos do áudio (5 min / 20 MB); a trava da imagem e
por que ela é acrescentada depois do texto do agente; que vídeo e documento não
são interpretados; e que a janela de 24h e os templates são só do canal Meta.

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
git add src/lib/messages/scheduled.ts src/components/inbox/composer.tsx src/components/inbox/bulk-template-dialog.tsx AGENTS.md
git commit -m "feat(whatsapp): agendadas e templates por provedor"
```

---

### Task 8: Despausar a IA, e o aviso de agente sem principal

**Files:**
- Modify: `src/lib/data/repos/db/conversations.ts`
- Modify: o componente do cabeçalho da conversa na inbox (descubra qual renderiza o nome do contato e os botões Atribuir/Finalizar)
- Modify: `src/components/ai/conversation-ai-tab.tsx`

**Interfaces:**
- Consumes: coluna `conversations.bot_paused` (migração `0032`).

**Por que esta tarefa existe.** Hoje `bot_paused` é escrito como `true` em
**exatamente um lugar** — `src/app/api/whatsapp/send/route.ts:216`, quando um
humano responde pelo CRM — e **nunca** volta para `false`. Não há botão, não há
rota, não há nada. Na prática: o atendente responde uma vez para tirar uma
dúvida rápida e a IA fica desligada **para sempre** naquela conversa, sem
nenhum indicador na tela dizendo por quê.

- [ ] **Step 1: Confirmar que a RLS deixa o membro despausar**

`conversations` tem policy de update para `authenticated` checando membership
(migração `0003`). Confirme lendo a policy antes de escrever a ação — se não
houver update permitido, esta tarefa precisa de rota server-side em vez de
update direto, e você deve relatar isso em vez de contornar.

- [ ] **Step 2: Ação de despausar no repo**

Em `src/lib/data/repos/db/conversations.ts`, acrescente ao objeto de ações:

```ts
/**
 * Religa a IA numa conversa que foi pausada quando um humano respondeu.
 * Sem isso a pausa é permanente: `bot_paused` só era escrito como true, em
 * `api/whatsapp/send/route.ts`, e nunca voltava.
 */
async despausarBot(conversationId: string): Promise<{ ok: boolean; error?: string }>
```

Atualize `bot_paused: false` no banco e reflita no store. **Não** filtre, mapeie
nem crie objeto dentro de selector do Zustand — devolve referência nova a cada
render e trava a página; derive com `useMemo`.

- [ ] **Step 3: Botão no cabeçalho da conversa**

Visível **somente** quando `bot_paused` é verdadeiro. Texto: `IA pausada` como
rótulo do estado, e a ação `Reativar IA`. Ao clicar, chama `despausarBot` e
mostra `toast.success("IA reativada nesta conversa")`.

Se o estado não estiver visível, o atendente não tem como saber que a IA parou —
metade do valor desta tarefa é o indicador, não o botão.

⚠️ Base UI, **não** Radix: triggers usam `render={<Button />}`, não `asChild`.
Estilo da casa: botões `h-8 text-xs`, primário indigo (#6366f1).

- [ ] **Step 4: Aviso de agente ativo sem principal**

Em `src/components/ai/conversation-ai-tab.tsx`: a auto-resposta só dispara para
o agente que é **principal E ativo** (`auto-reply.ts` filtra por
`is_primary = true` e `status = 'ativo'`). Hoje, se existir agente ativo e
nenhum marcado como principal, nada acontece e a tela não diz nada.

Mostre um aviso quando houver pelo menos um agente com `status = "ativo"` e
nenhum com `isPrimary`. Texto em pt-BR, deixando claro o efeito: nenhum agente
está respondendo automaticamente porque nenhum foi marcado como principal.

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
git add src/lib/data/repos/db/conversations.ts src/components
git commit -m "feat(ia): reativar a IA numa conversa pausada e avisar agente sem principal"
```

---

## Verificação final (manual, pelo Gabriel)

Sem test runner, a prova é de ponta a ponta, com o número de teste e o módulo de
IA liberado para a empresa:

1. Criar um agente, marcar como principal e ativo.
2. Mandar **texto** do celular → a IA responde.
3. Mandar **áudio** → a IA responde ao que foi dito, e a transcrição aparece na
   mensagem.
4. Mandar **foto de um produto** → a IA comenta a foto.
5. Mandar **foto de um comprovante de PIX** → a IA **não** confirma pagamento;
   diz que um atendente vai conferir. *(Este é o teste que mais importa.)*
6. Assumir a conversa como humano (`bot_paused`) → a IA para de responder.
7. Agendar uma mensagem em canal Evolution → dispara sem falar em janela de 24h.

## Self-review

**Cobertura da spec:** helper único (Task 2), auto-resposta bifurcada e ligada ao
webhook (Task 4), transcrição (Tasks 1 e 5), visão com trava (Tasks 3 e 6),
agendadas e templates (Task 7), log do motivo (Task 4, Step 2), tetos de custo
(Task 5, Step 2). Sem lacunas.

**Consistência de tipos:** `enviarTexto(db, channelId, paraE164, texto)` devolve
`ResultadoEnvio` na Task 2 e é consumida com essa assinatura nas Tasks 4 e 7.
`maybeAutoReply` perde `phoneNumberId` na Task 4 e os dois chamadores são
ajustados na mesma tarefa — não fica um chamador defasado entre tarefas.

**Fora de escopo, registrado:** interpretar vídeo e PDF; auto-resposta enviando
mídia; campanhas e automações disparando WhatsApp; transcrição de áudio enviado
pelo atendente; cota de consumo de IA por empresa.
