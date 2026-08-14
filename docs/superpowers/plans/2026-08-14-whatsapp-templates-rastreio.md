# WhatsApp — Criação de Templates + Rastreio de Entrega — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao módulo WhatsApp a criação/exclusão de templates (via Meta Graph API, sem tabela local) e o rastreio de entrega (enviado/entregue/lido/falhou) exclusivo dos envios de template.

**Architecture:** Camada Graph (`client.ts`) ganha `createTemplate`/`deleteTemplate` e `listTemplates` com todos os status. A rota `/api/whatsapp/templates` ganha `POST`/`DELETE` e um modo `?all=1`. A UI de `/whatsapp` vira 3 abas (Canais, Templates, Logs) com estado local. Para o rastreio, a migração `0031` acrescenta `template_name`, `delivered_at`, `read_at`, `failed_at`, `error_detail` em `messages`; o `send` grava `template_name`; o `webhook` carimba horários sem rebaixar status; a aba Logs lê só mensagens com `template_name`.

**Tech Stack:** Next.js (App Router) · TypeScript · Supabase (service role no webhook, RLS nas rotas autenticadas) · Base UI (Dialog/Select) · Tailwind · sonner (toasts) · Meta Cloud API (Graph v21).

## Global Constraints

- **Sem framework de testes no projeto.** O ciclo de verificação de cada task é: `npm run lint` + `npm run build` (type-check) passam sem erro, e verificação manual no preview quando houver UI. Helpers puros ficam isolados em módulos próprios para revisão direta.
- **Base UI ≠ Radix:** `DialogTrigger`/`SelectTrigger` não aceitam `asChild`; usar `render={<Button .../>}`. `SelectValue` precisa de children explícito; `onValueChange` recebe `string | null`.
- **Zustand:** nunca filtrar/mapear dentro do selector — selecionar array cru e derivar com `useMemo`.
- **Multi-tenant:** toda leitura de canal passa pela RLS (`getUser` nas rotas autenticadas); o webhook usa service role e casa por `phone_number_id`.
- **Texto de UI em pt-BR.** h1 `text-lg font-bold text-slate-900`; cards `rounded-xl border bg-white`; botões `h-8 text-xs`; badge de sucesso `bg-emerald-100 text-emerald-700`.
- **Commits em português**, convenção `feat(whatsapp): ...` / `fix(...)`. Autor dos commits: `EuGabis <pereiragabriel08790@gmail.com>`. Rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **A `messages` já tem `replica identity full`** e está publicada no Realtime (0022/0003) — a aba Logs recebe UPDATEs ao vivo sem migração extra de publicação.

## File Structure

- `src/lib/whatsapp/templates.ts` **(criar)** — helpers puros: `parseVariables`, `validateTemplateInput`, `buildBodyComponents`. Sem I/O; fácil de revisar.
- `src/lib/whatsapp/status-rank.ts` **(criar)** — helper puro `rankOf`/`isAdvance` para o "não rebaixar" do webhook.
- `src/lib/whatsapp/client.ts` **(modificar)** — `createTemplate`, `deleteTemplate`, `listTemplates(wabaId, opts)`.
- `src/app/api/whatsapp/templates/route.ts` **(modificar)** — `GET ?all=1`, `POST`, `DELETE`.
- `src/app/api/whatsapp/send/route.ts` **(modificar)** — grava `template_name` no envio de template.
- `src/app/api/whatsapp/webhook/route.ts` **(modificar)** — carimba horários + `error_detail`, sem rebaixar.
- `supabase/migrations/0031_whatsapp_template_tracking.sql` **(criar)** — colunas de rastreio + índice.
- `src/lib/data/repos/db/whatsapp.ts` **(modificar)** — `listAllTemplates`, `createTemplate`, `deleteTemplate`; store + hook de logs (`useTemplateLogs`).
- `src/components/whatsapp/templates-tab.tsx` **(criar)** — lista de templates + seletor de canal.
- `src/components/whatsapp/create-template-dialog.tsx` **(criar)** — diálogo de criação.
- `src/components/whatsapp/template-logs-tab.tsx` **(criar)** — tabela de rastreio.
- `src/app/(app)/whatsapp/page.tsx` **(modificar)** — 3 abas com estado local.

---

### Task 1: Helpers puros de template (parse + validação + componentes)

**Files:**
- Create: `src/lib/whatsapp/templates.ts`

**Interfaces:**
- Produces:
  - `parseVariables(body: string): number[]` — retorna os índices de `{{n}}` na ordem de aparição, com repetições removidas, ordenados crescente. Ex.: `"Oi {{1}}, seu pedido {{2}} ({{1}})"` → `[1, 2]`.
  - `type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION"`
  - `interface TemplateInput { name: string; category: TemplateCategory; language: string; bodyText: string; examples: string[] }`
  - `validateTemplateInput(input: TemplateInput): { ok: true } | { ok: false; error: string }`
  - `buildBodyComponents(bodyText: string, examples: string[]): unknown[]` — `[{ type: "BODY", text, ...(examples.length ? { example: { body_text: [examples] } } : {}) }]`.

- [ ] **Step 1: Escrever o módulo de helpers**

```ts
// src/lib/whatsapp/templates.ts
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface TemplateInput {
  name: string;
  category: TemplateCategory;
  language: string;
  bodyText: string;
  examples: string[];
}

/** Índices de {{n}} na ordem de aparição, sem repetição, ordenados. */
export function parseVariables(body: string): number[] {
  const seen = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

const CATEGORIES: TemplateCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];

/** Validação server-authority; o cliente repete por UX. */
export function validateTemplateInput(
  input: TemplateInput,
): { ok: true } | { ok: false; error: string } {
  if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
    return { ok: false, error: "Nome inválido: use minúsculas, números e _ (sem espaços)." };
  }
  if (!CATEGORIES.includes(input.category)) {
    return { ok: false, error: "Categoria inválida." };
  }
  if (!input.language.trim()) {
    return { ok: false, error: "Idioma obrigatório." };
  }
  if (!input.bodyText.trim()) {
    return { ok: false, error: "Corpo da mensagem obrigatório." };
  }
  const vars = parseVariables(input.bodyText);
  // sequenciais a partir de 1: [1,2,3...]
  const sequential = vars.every((n, i) => n === i + 1);
  if (!sequential) {
    return { ok: false, error: "Variáveis devem ser sequenciais começando em {{1}}." };
  }
  if (input.examples.length !== vars.length) {
    return { ok: false, error: "Informe um exemplo para cada variável." };
  }
  if (input.examples.some((e) => !e.trim())) {
    return { ok: false, error: "Exemplos de variável não podem ficar vazios." };
  }
  return { ok: true };
}

/** Componentes que a Graph API espera (só BODY). */
export function buildBodyComponents(bodyText: string, examples: string[]): unknown[] {
  const body: Record<string, unknown> = { type: "BODY", text: bodyText };
  if (examples.length) body.example = { body_text: [examples] };
  return [body];
}
```

- [ ] **Step 2: Conferência manual dos casos (revisão direta, sem runner)**

Confirme lendo o código que:
- `parseVariables("Oi {{1}}, pedido {{2}} de {{1}}")` → `[1, 2]`.
- `validateTemplateInput` reprova nome `"Meu Template"` (espaço/maiúscula), variáveis não sequenciais (`{{1}}` + `{{3}}`), e `examples.length` diferente do nº de variáveis.
- `buildBodyComponents("Oi {{1}}", ["João"])` → `[{ type:"BODY", text:"Oi {{1}}", example:{ body_text:[["João"]] } }]`.

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/templates.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): helpers de template (parse de variáveis + validação)"
```

---

### Task 2: Helper de ordem de status (não rebaixar)

**Files:**
- Create: `src/lib/whatsapp/status-rank.ts`

**Interfaces:**
- Produces:
  - `type WaStatus = "sent" | "delivered" | "read" | "failed"`
  - `rankOf(status: string): number` — `sent=1, delivered=2, read=3`; desconhecido/`failed` → `0`.
  - `isAdvance(current: string | null, next: string): boolean` — `true` se `next` for `failed`, ou se `rankOf(next) > rankOf(current)`.

- [ ] **Step 1: Escrever o helper**

```ts
// src/lib/whatsapp/status-rank.ts
export type WaStatus = "sent" | "delivered" | "read" | "failed";

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

export function rankOf(status: string | null): number {
  return status ? RANK[status] ?? 0 : 0;
}

/** failed sempre registra; senão só avança para status mais alto. */
export function isAdvance(current: string | null, next: string): boolean {
  if (next === "failed") return true;
  return rankOf(next) > rankOf(current);
}
```

- [ ] **Step 2: Conferência manual**

Confirme: `isAdvance("read", "delivered") === false` (não rebaixa); `isAdvance("sent", "read") === true`; `isAdvance("read", "failed") === true`; `isAdvance(null, "sent") === true`.

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/status-rank.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): helper de ordem de status (não rebaixar entregue/lido)"
```

---

### Task 3: Camada Graph — criar/excluir/listar todos os status

**Files:**
- Modify: `src/lib/whatsapp/client.ts`

**Interfaces:**
- Consumes: `buildBodyComponents` (Task 1), `TemplateCategory`/`TemplateInput` (Task 1).
- Produces:
  - `listTemplates(wabaId: string, opts?: { all?: boolean })` — sem `all`, mantém `status=APPROVED`; com `all:true`, lista todos os status. Cada item passa a incluir `status` (já incluído) e `category`.
  - `createTemplate(wabaId: string, input: { name: string; category: string; language: string; bodyText: string; examples: string[] }): Promise<{ id: string; status: string }>`
  - `deleteTemplate(wabaId: string, name: string): Promise<void>`

- [ ] **Step 1: Ajustar `listTemplates` e adicionar create/delete**

Modificar a assinatura de `listTemplates` (linha ~66) e acrescentar as funções. Substituir a função `listTemplates` existente por:

```ts
export async function listTemplates(wabaId: string, opts?: { all?: boolean }) {
  const statusFilter = opts?.all ? "" : "&status=APPROVED";
  const json = await graph(
    `${wabaId}/message_templates?limit=100${statusFilter}`,
    { method: "GET" },
  );
  return (json.data ?? []) as Array<{
    id?: string;
    name: string;
    language: string;
    status: string;
    category: string;
    components: unknown[];
  }>;
}

export async function createTemplate(
  wabaId: string,
  input: { name: string; category: string; language: string; bodyText: string; examples: string[] },
): Promise<{ id: string; status: string }> {
  const { buildBodyComponents } = await import("./templates");
  const json = await graph(`${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      category: input.category,
      language: input.language,
      components: buildBodyComponents(input.bodyText, input.examples),
    }),
  });
  return { id: json?.id ?? "", status: json?.status ?? "PENDING" };
}

export async function deleteTemplate(wabaId: string, name: string): Promise<void> {
  await graph(`${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}
```

(Se preferir import estático, adicionar `import { buildBodyComponents } from "./templates";` no topo e remover o `await import`. Ambos funcionam; o estático é mais simples.)

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros. `listTemplates` continua compatível com a chamada existente na rota (default = aprovados).

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/client.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): Graph API criar/excluir template e listar todos os status"
```

---

### Task 4: Rota `/api/whatsapp/templates` — GET(all)/POST/DELETE

**Files:**
- Modify: `src/app/api/whatsapp/templates/route.ts`

**Interfaces:**
- Consumes: `validateTemplateInput` (Task 1); `listTemplates`, `createTemplate`, `deleteTemplate` (Task 3).
- Produces (contratos HTTP):
  - `GET ?channelId&all=1` → `{ templates: [...] }` (todos os status).
  - `POST` body `{ channelId, name, category, language, bodyText, examples }` → `{ ok: true, id, status }` ou `4xx/502 { error }`.
  - `DELETE ?channelId&name` → `{ ok: true }` ou erro.

- [ ] **Step 1: Reescrever a rota**

```ts
import { createClient } from "@/lib/supabase/server";
import { listTemplates, createTemplate, deleteTemplate } from "@/lib/whatsapp/client";
import { validateTemplateInput, type TemplateCategory } from "@/lib/whatsapp/templates";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/** Resolve a WABA do canal respeitando a RLS (membership do usuário logado). */
async function wabaOf(supabase: any, channelId: string): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_channels")
    .select("waba_id")
    .eq("id", channelId)
    .maybeSingle();
  return data?.waba_id || null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const all = url.searchParams.get("all") === "1";
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    const templates = await listTemplates(wabaId, { all });
    return Response.json({ templates });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao listar templates" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: "payload inválido" }, { status: 400 }); }
  const { channelId, name, category, language, bodyText, examples } = body ?? {};
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const input = {
    name: String(name ?? "").trim(),
    category: category as TemplateCategory,
    language: String(language ?? "pt_BR").trim(),
    bodyText: String(bodyText ?? ""),
    examples: Array.isArray(examples) ? examples.map((e: unknown) => String(e ?? "")) : [],
  };
  const check = validateTemplateInput(input);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    const created = await createTemplate(wabaId, input);
    return Response.json({ ok: true, id: created.id, status: created.status });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao criar template" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const name = url.searchParams.get("name");
  if (!channelId || !name) return Response.json({ error: "channelId e name obrigatórios" }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    await deleteTemplate(wabaId, name);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao excluir template" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 3: Verificação manual (com dev server)**

Com sessão logada, no console do navegador:
`await fetch('/api/whatsapp/templates?channelId=<ID>&all=1').then(r=>r.json())` → objeto `{ templates }` (ou `{ error }` claro da Meta). Um `POST` com nome inválido (`"Teste X"`) deve voltar `400` com a mensagem de validação **antes** de chamar a Meta.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/templates/route.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): rota de templates com criar/excluir e listar todos os status"
```

---

### Task 5: Migração 0031 — colunas de rastreio

**Files:**
- Create: `supabase/migrations/0031_whatsapp_template_tracking.sql`

**Interfaces:**
- Produces (colunas em `public.messages`): `template_name text`, `delivered_at timestamptz`, `read_at timestamptz`, `failed_at timestamptz`, `error_detail text`; índice parcial `messages_template_name_idx`.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================
-- Lito CRM — Rastreio de entrega dos TEMPLATES de WhatsApp
--
-- template_name marca a mensagem como rastreável (só envios de template).
-- delivered_at/read_at/failed_at guardam a linha do tempo carimbada pelo
-- webhook (status já existe desde a 0022); error_detail traz o motivo da
-- falha. Índice parcial para a aba de Logs. Idempotente. Sem novas policies:
-- a messages já tem RLS por membership.
-- ============================================================
set check_function_bodies = off;

alter table public.messages add column if not exists template_name text;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists failed_at timestamptz;
alter table public.messages add column if not exists error_detail text;

create index if not exists messages_template_name_idx
  on public.messages (location_id, created_at desc)
  where template_name is not null;
```

- [ ] **Step 2: Aplicar a migração**

Aplicar via SQL Editor do Supabase (ou `node scripts/apply-migration.mjs supabase/migrations/0031_whatsapp_template_tracking.sql`). Confirmar no editor:

```sql
select column_name from information_schema.columns
where table_name = 'messages'
  and column_name in ('template_name','delivered_at','read_at','failed_at','error_detail');
```
Expected: 5 linhas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0031_whatsapp_template_tracking.sql
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): migração 0031 — rastreio de entrega de templates"
```

---

### Task 6: `send` grava template_name + webhook carimba sem rebaixar

**Files:**
- Modify: `src/app/api/whatsapp/send/route.ts:113-127`
- Modify: `src/app/api/whatsapp/webhook/route.ts:71-74`

**Interfaces:**
- Consumes: `isAdvance` (Task 2); colunas da migração 0031 (Task 5).

- [ ] **Step 1: `send` — gravar `template_name`**

No insert da mensagem de saída (`src/app/api/whatsapp/send/route.ts`, bloco `.insert({...})` por volta da linha 114), adicionar o campo condicional:

```ts
    .insert({
      location_id: conv.location_id,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      channel: "whatsapp",
      body: bodyText,
      channel_id: channel.id,
      wa_message_id: waMessageId,
      status: "sent",
      template_name: template ? template.name : null,
    })
```

- [ ] **Step 2: Webhook — carimbar horários sem rebaixar**

Substituir o laço de `statuses` (`src/app/api/whatsapp/webhook/route.ts`, ~linhas 71-74) por:

```ts
      for (const st of value.statuses ?? []) {
        if (st?.id && st?.status) {
          await applyStatus(db, st);
        }
      }
```

E adicionar, no fim do arquivo, a função (importando o helper no topo:
`import { isAdvance } from "@/lib/whatsapp/status-rank";`):

```ts
async function applyStatus(db: any, st: any) {
  const { data: msg } = await db
    .from("messages")
    .select("id, status")
    .eq("wa_message_id", st.id)
    .maybeSingle();
  if (!msg) return; // status de mensagem que não gravamos — ignora

  if (!isAdvance(msg.status, st.status)) return; // não rebaixa entregue/lido

  const patch: Record<string, unknown> = { status: st.status };
  const nowIso = st.timestamp
    ? new Date(Number(st.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  if (st.status === "delivered") patch.delivered_at = nowIso;
  if (st.status === "read") patch.read_at = nowIso;
  if (st.status === "failed") {
    patch.failed_at = nowIso;
    patch.error_detail = st.errors?.[0]?.title || st.errors?.[0]?.message || "Falha na entrega";
  }
  await db.from("messages").update(patch).eq("id", msg.id);
}
```

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Verificação manual da regra de ordem**

Sem WABA real é difícil e2e; confirme por leitura que `applyStatus` só grava quando `isAdvance` é `true` e que um evento `delivered` chegando depois de `read` (mesmo `wa_message_id`) não altera a linha (retorna cedo).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/send/route.ts src/app/api/whatsapp/webhook/route.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): grava template_name no envio e carimba entrega/leitura no webhook sem rebaixar"
```

---

### Task 7: Repo — ações de template + hook de logs

**Files:**
- Modify: `src/lib/data/repos/db/whatsapp.ts`

**Interfaces:**
- Consumes: rota `/api/whatsapp/templates` (Task 4); colunas da 0031 (Task 5).
- Produces (em `whatsappActions`):
  - `listAllTemplates(channelId: string): Promise<Array<{ id?: string; name: string; language: string; status: string; category: string; components: unknown[] }>>`
  - `createTemplate(channelId: string, input: { name: string; category: string; language: string; bodyText: string; examples: string[] }): Promise<{ ok: boolean; error?: string }>`
  - `deleteTemplate(channelId: string, name: string): Promise<{ ok: boolean; error?: string }>`
- Produces (hook): `useTemplateLogs(channelId: string | null): { logs: TemplateLog[]; ready: boolean }` — lê `messages` com `template_name is not null` do canal, ordenado por `created_at desc`, com Realtime nos UPDATEs. `TemplateLog` = `{ id, contactName, templateName, status, createdAt, deliveredAt, readAt, failedAt, errorDetail }`.

- [ ] **Step 1: Adicionar as ações em `whatsappActions`**

Acrescentar ao objeto `whatsappActions` (mantendo `templates` como está, usado pelo picker):

```ts
  async listAllTemplates(channelId: string) {
    const res = await fetch(
      `/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}&all=1`,
    );
    const json = await res.json().catch(() => ({}));
    return res.ok ? json.templates ?? [] : [];
  },

  async createTemplate(
    channelId: string,
    input: { name: string; category: string; language: string; bodyText: string; examples: string[] },
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch("/api/whatsapp/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, ...input }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json?.error };
  },

  async deleteTemplate(channelId: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(
      `/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}&name=${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json?.error };
  },
```

- [ ] **Step 2: Adicionar o tipo e o hook de logs**

Ao fim do arquivo:

```ts
export interface TemplateLog {
  id: string;
  contactName: string;
  templateName: string;
  status: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorDetail: string | null;
}

function mapLog(r: any): TemplateLog {
  const c = r.contacts ?? {};
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return {
    id: r.id,
    contactName: name || "—",
    templateName: r.template_name,
    status: r.status ?? null,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at ?? null,
    readAt: r.read_at ?? null,
    failedAt: r.failed_at ?? null,
    errorDetail: r.error_detail ?? null,
  };
}

export function useTemplateLogs(channelId: string | null) {
  const [logs, setLogs] = useState<TemplateLog[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!channelId) {
      setLogs([]);
      setReady(true);
      return;
    }
    const supabase = createClient();
    let active = true;

    const query = () =>
      supabase
        .from("messages")
        .select("id, template_name, status, created_at, delivered_at, read_at, failed_at, error_detail, contacts(first_name, last_name)")
        .eq("channel_id", channelId)
        .not("template_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

    setReady(false);
    void query().then(({ data }) => {
      if (!active) return;
      setLogs((data ?? []).map(mapLog));
      setReady(true);
    });

    const channel = supabase
      .channel(`tmpl-logs-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        () => {
          void query().then(({ data }) => {
            if (active) setLogs((data ?? []).map(mapLog));
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return { logs, ready };
}
```

Adicionar `useState` ao import de `react` no topo do arquivo (hoje só importa `useEffect`).

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/repos/db/whatsapp.ts
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): repo com ações de template e hook de logs (Realtime)"
```

---

### Task 8: Diálogo de criação de template

**Files:**
- Create: `src/components/whatsapp/create-template-dialog.tsx`

**Interfaces:**
- Consumes: `whatsappActions.createTemplate` (Task 7); `parseVariables`, `validateTemplateInput` (Task 1).
- Produces: `<CreateTemplateDialog channelId={string} onCreated={() => void} />`.

- [ ] **Step 1: Escrever o componente**

```tsx
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { parseVariables, validateTemplateInput, type TemplateCategory } from "@/lib/whatsapp/templates";

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

export function CreateTemplateDialog({
  channelId,
  onCreated,
}: {
  channelId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [bodyText, setBodyText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);

  const vars = useMemo(() => parseVariables(bodyText), [bodyText]);
  // mantém o array de exemplos do tamanho do nº de variáveis
  const exampleValues = vars.map((_, i) => examples[i] ?? "");

  const insertVar = () => {
    const next = vars.length + 1;
    setBodyText((b) => `${b}{{${next}}}`);
  };

  const submit = async () => {
    const input = { name: name.trim(), category, language: language.trim(), bodyText, examples: exampleValues };
    const check = validateTemplateInput(input);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setSaving(true);
    const res = await whatsappActions.createTemplate(channelId, input);
    setSaving(false);
    if (res.ok) {
      toast.success("Template enviado para revisão da Meta");
      setOpen(false);
      setName(""); setCategory("MARKETING"); setLanguage("pt_BR"); setBodyText(""); setExamples([]);
      onCreated();
    } else {
      toast.error(res.error ?? "Não foi possível criar o template");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 text-xs" />}>
        Criar template
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Nome (minúsculas, _ no lugar de espaço)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="ex.: confirmacao_pedido" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v as TemplateCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue>{CATEGORY_LABELS[category]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Idioma</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)}
                placeholder="pt_BR" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Corpo</Label>
              <button type="button" onClick={insertVar}
                className="text-[11px] font-medium text-indigo-600 hover:underline">
                + inserir variável
              </button>
            </div>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              rows={4} placeholder="Oi {{1}}, seu pedido {{2}} foi confirmado."
              className="rounded-md border px-2 py-1.5 text-xs" />
          </div>
          {vars.length > 0 && (
            <div className="grid gap-2">
              <Label className="text-xs">Exemplos das variáveis</Label>
              {vars.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="w-10 text-[11px] text-slate-500">{`{{${n}}}`}</span>
                  <Input value={exampleValues[i]} className="h-8 text-xs"
                    placeholder={`Exemplo para {{${n}}}`}
                    onChange={(e) =>
                      setExamples((prev) => {
                        const copy = vars.map((_, j) => prev[j] ?? "");
                        copy[i] = e.target.value;
                        return copy;
                      })
                    } />
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={saving}>
            {saving ? "Enviando..." : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/create-template-dialog.tsx
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): diálogo de criação de template (corpo + variáveis)"
```

---

### Task 9: Aba Templates (lista + seletor de canal)

**Files:**
- Create: `src/components/whatsapp/templates-tab.tsx`

**Interfaces:**
- Consumes: `useWhatsappChannels`, `whatsappActions.listAllTemplates`/`deleteTemplate` (Task 7); `<CreateTemplateDialog />` (Task 8).
- Produces: `<TemplatesTab />` (autossuficiente; gere seu próprio estado de canal selecionado).

- [ ] **Step 1: Escrever o componente**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useWhatsappChannels, whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { CreateTemplateDialog } from "./create-template-dialog";

interface Row { id?: string; name: string; language: string; status: string; category: string }

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado", PENDING: "Pendente", REJECTED: "Rejeitado",
};

export function TemplatesTab() {
  const { channels, ready } = useWhatsappChannels();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // auto-seleciona o primeiro canal
  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const load = async (id: string) => {
    setLoading(true);
    const list = await whatsappActions.listAllTemplates(id);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    if (channelId) void load(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const remove = async (name: string) => {
    if (!channelId) return;
    const res = await whatsappActions.deleteTemplate(channelId, name);
    if (res.ok) {
      toast.success("Template excluído");
      void load(channelId);
    } else {
      toast.error(res.error ?? "Não foi possível excluir");
    }
  };

  if (ready && !channels.length) {
    return <EmptyState title="Nenhum canal" description="Cadastre um canal de WhatsApp para gerenciar templates." />;
  }

  const selected = channels.find((c) => c.id === channelId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={channelId ?? ""} onValueChange={(v) => setChannelId(v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue>{selected?.name ?? "Selecione o canal"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {channelId && <CreateTemplateDialog channelId={channelId} onCreated={() => void load(channelId)} />}
      </div>

      <div className="rounded-xl border bg-white">
        {loading ? (
          <p className="p-4 text-xs text-slate-500">Carregando templates...</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Nenhum template neste canal.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Idioma</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.name}-${t.language}`} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-800">{t.name}</td>
                  <td className="px-3 py-2 text-slate-600">{t.category}</td>
                  <td className="px-3 py-2 text-slate-600">{t.language}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_STYLE[t.status] ?? "bg-slate-100 text-slate-600"}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(t.name)}
                      className="text-slate-400 hover:text-rose-600" title="Excluir">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros. (Conferir se `EmptyState` aceita `title`/`description` — ajustar às props reais do componente se divergir.)

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/templates-tab.tsx
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): aba de templates (lista com status, criar, excluir)"
```

---

### Task 10: Aba Logs (rastreio de templates)

**Files:**
- Create: `src/components/whatsapp/template-logs-tab.tsx`

**Interfaces:**
- Consumes: `useWhatsappChannels`, `useTemplateLogs` + `TemplateLog` (Task 7).
- Produces: `<TemplateLogsTab />`.

- [ ] **Step 1: Escrever o componente**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useWhatsappChannels, useTemplateLogs } from "@/lib/data/repos/db/whatsapp";

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-slate-100 text-slate-600",
  delivered: "bg-sky-100 text-sky-700",
  read: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<string, string> = {
  sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou",
};

const fmt = (iso: string | null) =>
  iso ? format(new Date(iso), "dd/MM HH:mm", { locale: ptBR }) : "—";

export function TemplateLogsTab() {
  const { channels, ready } = useWhatsappChannels();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const { logs } = useTemplateLogs(channelId);
  const filtered = useMemo(
    () => (statusFilter === "all" ? logs : logs.filter((l) => l.status === statusFilter)),
    [logs, statusFilter],
  );

  if (ready && !channels.length) {
    return <EmptyState title="Nenhum canal" description="Cadastre um canal para ver o rastreio de templates." />;
  }
  const selected = channels.find((c) => c.id === channelId);
  const FILTERS = [["all","Todos"],["sent","Enviado"],["delivered","Entregue"],["read","Lido"],["failed","Falhou"]] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Select value={channelId ?? ""} onValueChange={(v) => setChannelId(v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue>{selected?.name ?? "Selecione o canal"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue>{FILTERS.find(([v]) => v === statusFilter)?.[1] ?? "Todos"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Nenhum envio de template ainda.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Enviado</th>
                <th className="px-3 py-2 font-medium">Entregue</th>
                <th className="px-3 py-2 font-medium">Lido</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-slate-800">{l.contactName}</td>
                  <td className="px-3 py-2 text-slate-600">{l.templateName}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.deliveredAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.readAt)}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_STYLE[l.status ?? ""] ?? "bg-slate-100 text-slate-600"}>
                      {STATUS_LABEL[l.status ?? ""] ?? l.status ?? "—"}
                    </Badge>
                    {l.status === "failed" && l.errorDetail && (
                      <span className="ml-2 text-[10px] text-rose-500">{l.errorDetail}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/template-logs-tab.tsx
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): aba de logs de rastreio dos templates (Realtime)"
```

---

### Task 11: Página `/whatsapp` com 3 abas

**Files:**
- Modify: `src/app/(app)/whatsapp/page.tsx`

**Interfaces:**
- Consumes: `<ChannelsTable />`, `<CreateChannelDialog />` (existentes); `<TemplatesTab />` (Task 9); `<TemplateLogsTab />` (Task 10).

- [ ] **Step 1: Reescrever a página com abas por estado local**

```tsx
"use client";

import { useState } from "react";
import { ChannelsTable } from "@/components/whatsapp/channels-table";
import { CreateChannelDialog } from "@/components/whatsapp/create-channel-dialog";
import { TemplatesTab } from "@/components/whatsapp/templates-tab";
import { TemplateLogsTab } from "@/components/whatsapp/template-logs-tab";

type Tab = "canais" | "templates" | "logs";
const TABS: [Tab, string][] = [["canais", "Canais"], ["templates", "Templates"], ["logs", "Logs"]];

export default function WhatsappPage() {
  const [tab, setTab] = useState<Tab>("canais");
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">WhatsApp</h1>
          <p className="text-xs text-slate-500">
            Canais, templates da Meta e rastreio de entrega.
          </p>
        </div>
        {tab === "canais" && <CreateChannelDialog />}
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${
              tab === key
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "canais" && <ChannelsTable />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "logs" && <TemplateLogsTab />}
    </div>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 3: Verificação manual no preview**

`npm run dev` → `/whatsapp`: as 3 abas trocam; **Templates** lista os templates do canal (ou "Nenhum template"); **Criar template** valida nome/variáveis e mostra toast; **Logs** mostra a tabela (vazia até haver envio de template). Sem erros no console.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/whatsapp/page.tsx"
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "feat(whatsapp): página com abas Canais/Templates/Logs"
```

---

### Task 12: Atualizar AGENTS.md + fechamento

**Files:**
- Modify: `AGENTS.md` (seção de estado do WhatsApp)

- [ ] **Step 1: Registrar o estado no AGENTS.md**

Na seção de próximos passos/estado, adicionar uma linha resumindo: módulo WhatsApp agora cria/exclui templates (Graph API, sem tabela local) e rastreia entrega dos templates (colunas na `messages` via 0031; webhook carimba sem rebaixar; aba Logs com Realtime). Mencionar que o rastreio é **exclusivo de templates** por decisão de produto.

- [ ] **Step 2: Verificação final ponta a ponta (manual)**

Com WABA real: criar um template (fica **Pendente**); após aprovação da Meta, enviar esse template numa conversa; ver na aba **Logs** a linha evoluir **Enviado → Entregue → Lido** ao vivo; forçar um número inválido para ver **Falhou** + motivo.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit --author="EuGabis <pereiragabriel08790@gmail.com>" -m "docs(whatsapp): registra criação de templates + rastreio no guia"
```

---

## Self-Review

**Spec coverage:**
- Parte A (client create/delete/list-all) → Tasks 3, 4. UI templates + diálogo → Tasks 8, 9. ✓
- Parte B (migração 0031) → Task 5. `send` grava template_name → Task 6. Webhook sem rebaixar + timestamps + error_detail → Tasks 2, 6. Aba Logs → Tasks 7, 10. ✓
- 3 abas na página → Task 11. Validação (nome/variáveis/exemplos) → Tasks 1, 4 (server) + 8 (cliente). ✓
- Fora de escopo respeitado (sem ticks na conversa, sem tabela local, só corpo+variáveis). ✓

**Placeholder scan:** sem TBD/TODO; todo passo tem código real. ✓

**Type consistency:**
- `listTemplates(wabaId, opts?)` — assinatura idêntica em Task 3 (definição) e Task 4 (uso). ✓
- `createTemplate`/`deleteTemplate` (Graph, Task 3) vs `whatsappActions.createTemplate`/`deleteTemplate` (repo, Task 7) — nomes iguais, camadas diferentes (Graph recebe `wabaId`, repo recebe `channelId`); intencional e documentado nas Interfaces. ✓
- `TemplateLog` (Task 7) usado igual em Task 10. `isAdvance` (Task 2) usado em Task 6. `validateTemplateInput`/`parseVariables` (Task 1) usados em Tasks 4 e 8. ✓
- Nota de execução: em Task 9, confirmar props reais de `EmptyState` (`title`/`description`) e ajustar se o componente do repo usar outros nomes.
