# Mídia no canal Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o canal WhatsApp não oficial (Evolution) passa a enviar e receber imagem, áudio, vídeo e documento, com o mesmo comportamento que o canal Meta já tem.

**Architecture:** o caminho Meta não é tocado — a bifurcação por `whatsapp_channels.provider` segue o padrão que a rota de texto já usa. No envio, a rota gera uma URL assinada temporária do bucket e o gateway baixa sozinho (nenhum byte pela função). No recebimento, o webhook busca os bytes sob demanda e sobe para o bucket privado `conversation-media`.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (Storage + service role) · Evolution API v2.3.7 (Baileys)

**Spec:** `docs/superpowers/specs/2026-08-17-whatsapp-evolution-midia-design.md`

## Global Constraints

- **O gateway hospeda a instância `Teste`, de OUTRO projeto do dono, com número real.** Nenhuma tarefa pode ler, alterar ou apagar essa instância nem qualquer outra que o CRM não tenha criado. A instância do CRM é a que está gravada em `whatsapp_channels.evolution_instance`.
- **O projeto NÃO tem test runner.** Não existe `npm test`. Não crie teste, não instale dependência. Verificação é `npx tsc --noEmit` limpo, mais as sondas descritas em cada tarefa.
- **Não rode `dev` e `build` ao mesmo tempo** — isso já corrompeu o `.next` e travou o build com lock. Se precisar do build, pare o dev e apague `.next`.
- Shell é **PowerShell 5.1**: `&&` não existe, use `;`.
- **`EVOLUTION_API_KEY` é a chave GLOBAL do gateway.** Só pode ser usada em `instance/*` e `webhook/*`. Envio e download de mídia usam o **token da instância**.
- **`evolution_token` e `webhook_secret` não são legíveis pela sessão do usuário** desde a `0058`. Rota autenticada que precise deles busca à parte com `createAdminClient()`, escopado por um id que a RLS já validou.
- Nunca logar: conteúdo de mensagem, nome de arquivo do cliente, `evolution_token`, `webhook_secret`, URL assinada. Erro do Postgres ecoa o valor ofensor — logue só `code`.
- Texto de UI e mensagens de erro em **pt-BR**.
- Commits em português: `feat(whatsapp): descrição`. Commit + push na `main` a cada tarefa.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/whatsapp/media-limits.ts` (criar) | Tetos por tipo e o mapeamento mime→tipo. Fonte única, usada nos dois sentidos. |
| `src/lib/evolution/client.ts` (modificar) | `sendMedia`, `sendWhatsAppAudio`, `baixarMidia`. |
| `src/app/api/whatsapp/send-media/route.ts` (modificar) | Bifurcação por provedor. |
| `src/app/api/whatsapp/evolution/webhook/route.ts` (modificar) | Reconhecer e guardar os quatro tipos. |
| `AGENTS.md` (modificar) | Documentar limites e o fluxo dos bytes. |

---

### Task 1: Sondar o gateway e registrar os formatos reais

**Files:**
- Create: `.superpowers/sdd/2026-08-18-whatsapp-evolution-midia/sonda.md`

**Interfaces:**
- Produces: o documento `sonda.md`, que as Tasks 2 e 4 leem como **fonte de verdade** dos nomes de campo. Nenhum código.

Esta tarefa existe porque os formatos de mídia da Evolution **não estão confirmados**. Na fase anterior a mesma sonda achou três divergências (token em `hash` na raiz; QR aninhado no `create` e plano no `connect`; webhook em `POST /webhook/set/{nome}` com corpo aninhado) que teriam quebrado em produção sem o build acusar nada.

- [ ] **Step 1: Descobrir a instância do CRM**

Nunca derive o nome; leia do banco. Peça ao Gabriel o retorno cru de:

```sql
select evolution_instance, connection_state from public.whatsapp_channels where provider = 'evolution';
```

Use **apenas** a instância que aparecer aí.

- [ ] **Step 2: Confirmar o endpoint de envio de mídia**

Com o token da instância (não a chave global), descubra:
1. O campo do arquivo aceita **URL**, ou só base64?
2. Como se chamam os campos de tipo (`mediatype`?), nome do arquivo (`fileName`?) e legenda (`caption`?)?
3. Que valores o campo de tipo aceita para imagem, vídeo e documento?

Mande para o **seu próprio número**, nunca para um terceiro.

- [ ] **Step 3: Confirmar o endpoint de áudio de voz**

Ele converte sozinho o `webm` que o navegador grava, ou exige um formato específico? Se exigir, registre qual — isso muda o desenho e precisa ser reportado, não contornado.

- [ ] **Step 4: Confirmar o download de mídia recebida**

Mande do celular uma imagem, um áudio, um vídeo e um documento para a instância. Para cada um, capture do payload de `MESSAGES_UPSERT`:
- onde estão mime, nome do arquivo e tamanho;
- o caminho exato dentro de `body.data.message` (`imageMessage`, `audioMessage`, …);
- se áudio de voz e áudio-arquivo se distinguem (campo `ptt`?).

Depois confirme qual endpoint devolve os bytes e o que ele exige — a chave da mensagem ou a mensagem inteira.

- [ ] **Step 5: Escrever `sonda.md`**

Registre, para cada endpoint: método, caminho, corpo exato, e o caminho de cada campo na resposta. Onde a sonda **não** conseguiu confirmar algo, escreva "NÃO CONFIRMADO" com todas as letras — suposição silenciosa é o que quebra em produção.

- [ ] **Step 6: Confirmar que nada foi tocado**

`GET /instance/fetchInstances` e confirme que a instância `Teste` continua presente e com o mesmo estado. Registre no fim do `sonda.md`.

- [ ] **Step 7: Commit**

```bash
git add .superpowers/sdd/2026-08-18-whatsapp-evolution-midia/sonda.md
git commit -m "docs(whatsapp): sonda dos formatos de midia da Evolution"
```

---

### Task 2: Limites e funções de mídia no cliente

**Files:**
- Create: `src/lib/whatsapp/media-limits.ts`
- Modify: `src/lib/evolution/client.ts`
- Read first: `.superpowers/sdd/2026-08-18-whatsapp-evolution-midia/sonda.md`

**Interfaces:**
- Consumes: os formatos confirmados na Task 1.
- Produces:
  - `LIMITES: Record<TipoMidia, number>` e `type TipoMidia = "image" | "audio" | "video" | "file"`
  - `tipoPorMime(mime: string): TipoMidia | null`
  - `limiteExcedido(tipo: TipoMidia, bytes: number): boolean`
  - `rotuloLimite(tipo: TipoMidia): string` — ex.: `"5 MB"`, para mensagem de erro
  - `sendMedia(nome, token, paraE164, tipo, url, nomeArquivo, legenda): Promise<{ id: string }>`
  - `sendWhatsAppAudio(nome, token, paraE164, url): Promise<{ id: string }>`
  - `baixarMidia(nome, token, chave): Promise<{ bytes: ArrayBuffer; mime: string }>`

- [ ] **Step 1: Criar o módulo de limites**

```ts
// src/lib/whatsapp/media-limits.ts
/**
 * Tetos de tamanho, aplicados NOS DOIS SENTIDOS (envio e recebimento).
 * São os mesmos limites do WhatsApp: aceitar acima disso seria guardar no
 * Storage — que é do dono da plataforma — um arquivo que o WhatsApp
 * recusaria adiante.
 */
export type TipoMidia = "image" | "audio" | "video" | "file";

const MB = 1024 * 1024;

export const LIMITES: Record<TipoMidia, number> = {
  image: 5 * MB,
  audio: 16 * MB,
  video: 16 * MB,
  file: 100 * MB,
};

export function tipoPorMime(mime: string): TipoMidia | null {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (!m) return null;
  return "file";
}

export function limiteExcedido(tipo: TipoMidia, bytes: number): boolean {
  return bytes > LIMITES[tipo];
}

export function rotuloLimite(tipo: TipoMidia): string {
  return `${Math.round(LIMITES[tipo] / MB)} MB`;
}
```

- [ ] **Step 2: Verificar o mapeamento**

```bash
npx tsx -e "import {tipoPorMime,limiteExcedido} from './src/lib/whatsapp/media-limits'; console.log(tipoPorMime('image/png'), tipoPorMime('application/pdf'), tipoPorMime(''), limiteExcedido('image', 6*1024*1024))"
```

Esperado: `image file null true`. Se `tsx` não estiver disponível, faça a mesma conferência mentalmente e registre no relatório — **não instale dependência**.

- [ ] **Step 3: Escrever as três funções no cliente**

Use os nomes de campo confirmados no `sonda.md` — **não os invente**. As três usam o **token da instância**, nunca `globalKey()`. Acrescente as rotas novas ao comentário de rotas confirmadas no topo do arquivo, no mesmo formato das existentes.

Onde o `sonda.md` disser "NÃO CONFIRMADO", escreva o código com um comentário dizendo exatamente isso e o que acontece se a suposição estiver errada — como já foi feito com o `key.id` do `sendText`.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Esperado: `No errors found`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/media-limits.ts src/lib/evolution/client.ts
git commit -m "feat(whatsapp): limites de midia e funcoes de midia no cliente Evolution"
```

---

### Task 3: Envio de mídia bifurcado por provedor

**Files:**
- Modify: `src/app/api/whatsapp/send-media/route.ts`

**Interfaces:**
- Consumes: `sendMedia`, `sendWhatsAppAudio`, `tipoPorMime`, `limiteExcedido`, `rotuloLimite` da Task 2.

⚠️ **Esta rota está em produção servindo o caminho Meta.** Se ele quebrar, para de sair mídia para os clientes que já usam. Antes de mexer, leia `src/app/api/whatsapp/send/route.ts` — a bifurcação da rota de texto é o padrão a copiar.

- [ ] **Step 1: Isolar o caminho Meta**

Envolva o corpo atual num `else`, sem alterar nenhuma linha dele. O roteamento é `if (provider === "evolution") { … } else { … }` — **nunca** `if (provider === "meta")`: canal legado tem `provider` nulo e precisa cair no ramo Meta.

- [ ] **Step 2: Manter o limite diário fora dos dois ramos**

`daily_limit` é regra do produto, não do provedor. Confirme que ele continua sendo aplicado antes da bifurcação, como já está.

- [ ] **Step 3: Escrever o ramo Evolution**

Nesta ordem:

```ts
// 1. canal conectado?
if (channel.connection_state !== "open") {
  return Response.json(
    { error: "WhatsApp desconectado — reconecte o canal antes de enviar." },
    { status: 409 },
  );
}

// 2. tamanho do objeto no bucket, ANTES de gerar URL ou chamar o gateway
const tipo = tipoPorMime(mime ?? "");
if (!tipo) return Response.json({ error: "Tipo de arquivo não reconhecido" }, { status: 400 });
if (limiteExcedido(tipo, tamanhoEmBytes)) {
  return Response.json(
    { error: `Arquivo maior que o limite de ${rotuloLimite(tipo)} para ${tipo}.` },
    { status: 400 },
  );
}

// 3. token do canal — segredo, só a service role lê (0058). O eq("id", channel.id)
//    usa o id que a RLS já validou: a service role não amplia o alcance.
const admin = createAdminClient();
const { data: segredo } = await admin
  .from("whatsapp_channels")
  .select("evolution_instance, evolution_token")
  .eq("id", channel.id)
  .maybeSingle();
if (!segredo?.evolution_instance || !segredo?.evolution_token) {
  return Response.json({ error: "Canal sem instância provisionada — reconecte o canal." }, { status: 409 });
}

// 4. URL assinada de curta duração; o gateway baixa sozinho
const { data: assinada, error: erroUrl } = await admin.storage
  .from("conversation-media")
  .createSignedUrl(mediaPath, 300);
if (erroUrl || !assinada?.signedUrl) {
  return Response.json({ error: "Não foi possível preparar o arquivo para envio." }, { status: 500 });
}
```

O tamanho vem do objeto no Storage, não do corpo do request — cliente não é fonte de verdade sobre o tamanho do próprio arquivo.

Depois: `kind === "audio"` chama `sendWhatsAppAudio`; os demais chamam `sendMedia`. Erro do gateway devolve mensagem genérica (o erro cru ecoa o nome da instância no path). **Nunca** logue a URL assinada.

- [ ] **Step 4: Conferir que o ramo Meta não regrediu**

Compare com `git show HEAD~1:src/app/api/whatsapp/send-media/route.ts`, item a item: mesma ordem de checagens, mesmo `uploadMedia`+`sendMediaMessage`, mesmos campos gravados na mensagem. Registre a conferência no relatório.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/whatsapp/send-media/route.ts
git commit -m "feat(whatsapp): envio de midia bifurcado por provedor"
```

---

### Task 4: Recebimento de mídia no webhook, e documentação

**Files:**
- Modify: `src/app/api/whatsapp/evolution/webhook/route.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `baixarMidia`, `tipoPorMime`, `limiteExcedido` da Task 2; os caminhos de payload do `sonda.md`.

- [ ] **Step 1: Acrescentar o token à consulta do canal**

A consulta do canal no webhook hoje seleciona `id, location_id, daily_limit, webhook_secret, connection_state`. `baixarMidia` precisa de `evolution_instance` e `evolution_token` — acrescente os dois. O webhook já usa a service role, então lê as colunas secretas normalmente.

- [ ] **Step 2: Reconhecer os quatro tipos**

Em `handleMessage`, além do texto que já trata, reconheça `imageMessage`, `audioMessage`, `videoMessage` e `documentMessage` dentro de `body.data.message`, usando os caminhos do `sonda.md`. Mapeie para os tipos da tabela: imagem→`image`, áudio→`audio`, vídeo→`video`, **documento→`file`** (não existe tipo `document` no `messages_type_check`).

- [ ] **Step 3: Guardar no bucket**

Espelhe o que o webhook da Meta já faz (`src/app/api/whatsapp/webhook/route.ts`, bloco de mídia):

```ts
const path = `${channel.location_id}/${contact.id}/${crypto.randomUUID()}.${ext}`;
const { error: upErr } = await db.storage
  .from("conversation-media")
  .upload(path, new Uint8Array(bytes), { contentType: mime, upsert: false });
if (upErr) throw upErr;
```

Antes de baixar, cheque o tamanho declarado no payload: se passar do limite, **pule o download** — não gaste banda e Storage com arquivo que vai ser recusado.

- [ ] **Step 4: Falha de mídia não pode perder a mensagem**

Se o tamanho estourar, o download falhar ou o upload falhar, a mensagem **ainda é gravada**, com o corpo marcando o que chegou (ex.: `[imagem não disponível]`) e sem as colunas de mídia. Perder a mensagem de um cliente em silêncio é pior que mostrá-la incompleta.

O webhook continua respondendo **200 sempre**. O log da falha registra tipo, tamanho e motivo — nunca o conteúdo, o nome do arquivo do cliente, o token ou a URL.

- [ ] **Step 5: Verificar a idempotência**

A checagem por `wa_message_id` já existe e precisa continuar valendo para mídia: o gateway reenvia o mesmo evento em retry, e sem isso cada retry vira uma cópia do arquivo no Storage — que é do dono da plataforma. Confirme que a checagem acontece **antes** do download.

- [ ] **Step 6: Documentar no `AGENTS.md`**

Na seção "WhatsApp não oficial (Evolution)", acrescente: os limites por tipo e onde eles moram (`src/lib/whatsapp/media-limits.ts`); que documento é o tipo `file`; que no envio o gateway baixa por URL assinada e no recebimento os bytes passam pela função; e que mensagem com mídia que falha é gravada mesmo assim.

- [ ] **Step 7: Type check e build**

```bash
npx tsc --noEmit
```

Depois, com o dev parado e `.next` apagado:

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/api/whatsapp/evolution/webhook/route.ts AGENTS.md
git commit -m "feat(whatsapp): recebimento de midia no canal Evolution"
```

---

## Verificação final (manual, pelo Gabriel)

O CRM não tem test runner, então a prova é de ponta a ponta, com um número de teste:

1. Do celular, mandar para o número conectado: uma foto, um áudio, um vídeo e um PDF. Os quatro têm que aparecer na inbox, com o arquivo visível.
2. Da inbox, responder com cada um dos quatro tipos. Os quatro têm que chegar no celular — e o áudio tem que chegar como **áudio de voz**, com onda sonora, não como anexo.
3. Mandar um arquivo acima do limite: o CRM tem que recusar com mensagem clara, sem subir nada.

## Self-review

**Cobertura da spec:** as quatro peças da spec (cliente, envio bifurcado, recebimento, limites) têm tarefa; a sonda é a Task 1; o tratamento de erro está no Step 4 da Task 4; a documentação está no Step 6 da Task 4. Sem lacunas.

**Consistência de tipos:** `TipoMidia` é `"image" | "audio" | "video" | "file"` na Task 2 e é esse mesmo conjunto que a Task 3 e a Task 4 usam. Documento é `file` nos dois lugares.

**Fora de escopo, registrado:** auto-resposta com IA para mídia; cota de armazenamento por empresa; mídia em agendadas e campanhas; figurinha, localização e contato compartilhado.
