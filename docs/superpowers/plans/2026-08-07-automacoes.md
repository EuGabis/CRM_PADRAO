# Automações reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workflows do CRM ON que reagem a eventos do banco e executam ações reais (tags, oportunidades, tarefas, e-mail, espera, condições, webhook) sem ninguém com o navegador aberto.

**Architecture:** Triggers no Postgres capturam eventos e enfileiram em `automation_runs`; `pg_cron` chama a cada minuto (via `pg_net`) a rota protegida `/api/automations/tick` do Next na Vercel, que executa os passos em TypeScript com a service role e grava `automation_logs`.

**Tech Stack:** Supabase (Postgres, pg_cron, pg_net) · Next.js 16 Route Handlers · @supabase/supabase-js (service role, só no servidor) · Resend · Zustand/shadcn no front.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-automacoes-design.md`. Convenções do repo: `AGENTS.md`.
- Texto de UI em **pt-BR**; marca só via `brand` (`src/lib/config/brand.ts`).
- Base UI (shadcn): sem `asChild`; `SelectValue` com children; `Accordion` sem `type`.
- Zustand: nunca filtrar dentro do selector — selecionar cru e derivar com `useMemo`.
- Toda tabela nova: `location_id` + RLS habilitada + `revoke ... from anon` + políticas `TO authenticated` via `private.user_locations()`.
- Segredos (`SUPABASE_SERVICE_ROLE_KEY`, `AUTOMATION_SECRET`) **nunca** com prefixo `NEXT_PUBLIC_`; adicionar em `.env.local`, `.env.example` e na Vercel (production+preview+development).
- Migrações: arquivo novo em `supabase/migrations/000N_nome.sql`, aplicado pelo usuário no SQL Editor.
- Cada tarefa termina com `npm run build` limpo + commit em português (`feat(automacoes): ...`).
- `pg_cron` e `pg_net` já estão habilitados no projeto Supabase.

---

### Task 1: Schema do motor (migração 0007)

**Files:**
- Create: `supabase/migrations/0007_automations_engine.sql`
- Test: aplicar no SQL Editor e conferir tabelas/policies

**Interfaces:**
- Produces: tabelas `automation_runs`, `automation_logs`; colunas `workflows.trigger_key`, `workflows.trigger_config`, `workflows.steps`; função `private.enqueue_automation(...)`.

- [ ] **Step 1: Colunas novas em workflows**

```sql
alter table public.workflows
  add column if not exists trigger_key text,
  add column if not exists trigger_config jsonb not null default '{}',
  add column if not exists steps jsonb not null default '[]';
```

- [ ] **Step 2: Tabelas de execução**

```sql
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','running','waiting','done','failed','cancelled')),
  current_step int not null default 0,
  next_run_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  attempts int not null default 0,
  last_error text,
  event_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automation_runs_event_key_uniq
  on public.automation_runs (event_key) where event_key is not null;
create index if not exists automation_runs_due_idx
  on public.automation_runs (status, next_run_at);
create index if not exists automation_runs_location_idx
  on public.automation_runs (location_id, created_at desc);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  run_id uuid not null references public.automation_runs (id) on delete cascade,
  step_index int not null,
  action_key text not null,
  status text not null check (status in ('ok','skipped','error')),
  message text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists automation_logs_run_idx on public.automation_logs (run_id, step_index);
```

- [ ] **Step 3: RLS (leitura para membros; escrita fica com a service role)**

```sql
alter table public.automation_runs enable row level security;
alter table public.automation_logs enable row level security;
revoke all on public.automation_runs, public.automation_logs from anon;

create policy "membros leem" on public.automation_runs
  for select to authenticated
  using (location_id in (select private.user_locations()));
create policy "membros excluem" on public.automation_runs
  for delete to authenticated
  using (location_id in (select private.user_locations()));
create policy "membros leem" on public.automation_logs
  for select to authenticated
  using (location_id in (select private.user_locations()));
```

- [ ] **Step 4: Função de enfileiramento (usada por todos os triggers)**

```sql
create or replace function private.enqueue_automation(
  p_trigger_key text,
  p_location_id uuid,
  p_contact_id uuid,
  p_opportunity_id uuid,
  p_payload jsonb,
  p_event_key text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  wf record;
begin
  for wf in
    select id, trigger_config from public.workflows
    where location_id = p_location_id
      and status = 'published'
      and trigger_key = p_trigger_key
  loop
    -- anti-loop: mesmo workflow + contato nos últimos 5 minutos
    if exists (
      select 1 from public.automation_runs r
      where r.workflow_id = wf.id
        and r.contact_id is not distinct from p_contact_id
        and r.created_at > now() - interval '5 minutes'
    ) then
      continue;
    end if;

    insert into public.automation_runs
      (location_id, workflow_id, contact_id, opportunity_id, payload, event_key)
    values
      (p_location_id, wf.id, p_contact_id, p_opportunity_id, p_payload,
       p_event_key || ':' || wf.id::text)
    on conflict (event_key) do nothing;
  end loop;
end;
$$;

revoke all on function private.enqueue_automation(text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
```

- [ ] **Step 5: Aplicar e verificar**

Pedir ao usuário para rodar o SQL no editor. Verificar com:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'automation%';
```
Esperado: `automation_runs`, `automation_logs`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0007_automations_engine.sql
git commit -m "feat(automacoes): schema do motor (runs, logs, enfileiramento)"
```

---

### Task 2: Triggers de eventos (migração 0008)

**Files:**
- Create: `supabase/migrations/0008_automation_triggers.sql`

**Interfaces:**
- Consumes: `private.enqueue_automation(text, uuid, uuid, uuid, jsonb, text)`.
- Produces: triggers em `contacts`, `opportunities`, `messages`, `appointments`; job diário de aniversário.

- [ ] **Step 1: Contatos (criado / tag adicionada / atualizado)**

```sql
create or replace function private.on_contact_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_tags text[];
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation('contato-criado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id), 'contato-criado:' || new.id::text);
    return new;
  end if;

  select array(select unnest(new.tags) except select unnest(old.tags)) into new_tags;
  if array_length(new_tags, 1) > 0 then
    perform private.enqueue_automation('tag-adicionada', new.location_id, new.id, null,
      jsonb_build_object('tags', to_jsonb(new_tags)),
      'tag:' || new.id::text || ':' || array_to_string(new_tags, ',') || ':' || extract(epoch from now())::bigint::text);
  end if;

  if new.custom_fields is distinct from old.custom_fields
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone then
    perform private.enqueue_automation('contato-atualizado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id),
      'contato-upd:' || new.id::text || ':' || extract(epoch from now())::bigint::text);
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_automation on public.contacts;
create trigger contacts_automation
  after insert or update on public.contacts
  for each row execute function private.on_contact_change();
```

- [ ] **Step 2: Oportunidades (criada / fase alterada / ganha / perdida)**

```sql
create or replace function private.on_opportunity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation('oportunidade-criada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('stage_id', new.stage_id, 'pipeline_id', new.pipeline_id),
      'op-criada:' || new.id::text);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    perform private.enqueue_automation('fase-alterada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id,
                         'pipeline_id', new.pipeline_id),
      'fase:' || new.id::text || ':' || new.stage_id::text);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform private.enqueue_automation('oportunidade-ganha', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value), 'op-ganha:' || new.id::text);
    elsif new.status = 'lost' then
      perform private.enqueue_automation('oportunidade-perdida', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value), 'op-perdida:' || new.id::text);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_automation on public.opportunities;
create trigger opportunities_automation
  after insert or update on public.opportunities
  for each row execute function private.on_opportunity_change();
```

- [ ] **Step 3: Mensagem recebida e compromisso agendado**

```sql
create or replace function private.on_message_in()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  if new.direction <> 'in' then return new; end if;
  select contact_id into c from public.conversations where id = new.conversation_id;
  perform private.enqueue_automation('cliente-respondeu', new.location_id, c, null,
    jsonb_build_object('channel', new.channel, 'body', new.body),
    'resp:' || new.id::text);
  return new;
end;
$$;

drop trigger if exists messages_automation on public.messages;
create trigger messages_automation
  after insert on public.messages
  for each row execute function private.on_message_in();

create or replace function private.on_appointment_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_automation('compromisso-agendado', new.location_id, new.contact_id, null,
    jsonb_build_object('starts_at', new.starts_at, 'title', new.title),
    'compromisso:' || new.id::text);
  return new;
end;
$$;

drop trigger if exists appointments_automation on public.appointments;
create trigger appointments_automation
  after insert on public.appointments
  for each row execute function private.on_appointment_created();
```

- [ ] **Step 4: Aniversários (job diário às 12:00 UTC / 09:00 BRT)**

```sql
create or replace function private.enqueue_birthdays()
returns void language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  for c in
    select id, location_id from public.contacts
    where custom_fields ->> 'Data de aniversário' is not null
      and to_char((custom_fields ->> 'Data de aniversário')::date, 'MM-DD') = to_char(now(), 'MM-DD')
  loop
    perform private.enqueue_automation('aniversario', c.location_id, c.id, null,
      '{}'::jsonb, 'aniversario:' || c.id::text || ':' || to_char(now(), 'YYYY'));
  end loop;
exception when others then
  return; -- data inválida em custom_fields não pode derrubar o job
end;
$$;

select cron.schedule('crm-aniversarios', '0 12 * * *', $$select private.enqueue_birthdays()$$);
```

- [ ] **Step 5: Aplicar e verificar**

```sql
select tgname from pg_trigger where tgname like '%automation%';
```
Esperado: `contacts_automation`, `opportunities_automation`, `messages_automation`, `appointments_automation`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_automation_triggers.sql
git commit -m "feat(automacoes): triggers de eventos que alimentam a fila"
```

---

### Task 3: Executor em TypeScript (rota protegida)

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/automations/types.ts`, `src/lib/automations/actions.ts`, `src/lib/automations/engine.ts`, `src/app/api/automations/tick/route.ts`
- Modify: `.env.local`, `.env.example`

**Interfaces:**
- Produces:
```ts
// types.ts
export type ActionKey =
  | "adicionar-tag" | "remover-tag" | "atualizar-campo" | "atribuir-usuario"
  | "criar-oportunidade" | "mover-fase" | "criar-tarefa" | "criar-compromisso"
  | "enviar-email" | "nota-interna" | "esperar" | "condicao" | "webhook"
  | "enviar-whatsapp" | "enviar-sms";
export interface Step { key: ActionKey; config: Record<string, unknown> }
export interface RunContext {
  runId: string; locationId: string; contactId: string | null;
  opportunityId: string | null; payload: Record<string, unknown>;
}
export interface ActionResult {
  status: "ok" | "skipped" | "error";
  message?: string;
  waitUntil?: string;   // ISO — coloca o run em 'waiting'
  jumpTo?: number;      // índice do passo (usado pela condição)
}
// actions.ts
export async function runAction(step: Step, ctx: RunContext): Promise<ActionResult>;
export function renderTemplate(text: string, vars: Record<string, string>): string;
// engine.ts
export async function processDueRuns(limit?: number): Promise<{ processed: number; errors: number }>;
```

- [ ] **Step 1: Cliente admin (service role, só servidor)**

```ts
// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

/** Cliente com service role — NUNCA importar em componente client. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- [ ] **Step 2: Ações**

Implementar `runAction` com um `switch` por `step.key`, usando `createAdminClient()`:
- `adicionar-tag` / `remover-tag`: lê `contacts.tags`, grava array atualizado.
- `atualizar-campo`: `custom_fields[config.field] = renderTemplate(config.value, vars)`.
- `atribuir-usuario`: `contacts.owner_id = config.userId`.
- `criar-oportunidade`: insert em `opportunities` (pipeline/fase de `config`).
- `mover-fase`: update `stage_id` (+ `status` won/lost pelo nome da fase, como em `db/pipeline.ts`).
- `criar-tarefa`: insert em `tasks` (`due_at = now + config.dueInDays`).
- `criar-compromisso`: insert em `appointments`.
- `enviar-email`: Resend com `renderTemplate` no assunto/corpo; se `contact.dnd` → `skipped`.
- `nota-interna`: insert em `messages` com `internal = true` na conversa do contato (cria a conversa se não existir).
- `esperar`: retorna `{ status: "ok", waitUntil }` calculado de `config.minutes|hours|days`.
- `condicao`: avalia `config.field/operator/value` contra o contato; retorna `jumpTo` do ramo falso quando não bate.
- `webhook`: `fetch(config.url, { method: "POST", body: JSON.stringify(ctx) })`, timeout 10s.
- `enviar-whatsapp` / `enviar-sms`: `{ status: "skipped", message: "Canal não conectado" }`.

- [ ] **Step 3: Motor**

`processDueRuns()`:
1. `select * from automation_runs where status in ('pending','waiting') and next_run_at <= now() limit 25`.
2. Marca `status='running'`.
3. Para cada run: carrega `workflows.steps`, executa a partir de `current_step`, grava `automation_logs` por passo (com `duration_ms`), respeita teto de 50 passos.
4. `waitUntil` → `status='waiting'`, `next_run_at=waitUntil`, `current_step+1`.
5. Erro → `attempts+1`; se `< 3`, reagenda (1min/5min/15min); senão `status='failed'` com `last_error`.
6. Fim da lista → `status='done'`.

- [ ] **Step 4: Rota protegida**

```ts
// src/app/api/automations/tick/route.ts
import { processDueRuns } from "@/lib/automations/engine";

export async function POST(request: Request) {
  const secret = request.headers.get("x-automation-secret");
  if (!secret || secret !== process.env.AUTOMATION_SECRET) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  const result = await processDueRuns();
  return Response.json(result);
}
```

- [ ] **Step 5: Variáveis de ambiente**

Adicionar em `.env.local` e `.env.example` (e depois na Vercel):
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API → service_role) e
`AUTOMATION_SECRET` (string aleatória de 32+ caracteres).

- [ ] **Step 6: Verificar**

```bash
npm run build
curl -s -X POST http://localhost:3000/api/automations/tick -H "x-automation-secret: <valor>" -w "\n%{http_code}\n"
```
Esperado: `{"processed":0,"errors":0}` e `200`. Sem o header: `401`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/automations src/app/api/automations .env.example
git commit -m "feat(automacoes): executor de ações e rota protegida do motor"
```

---

### Task 4: Agendamento pelo pg_cron (migração 0009)

**Files:**
- Create: `supabase/migrations/0009_automation_cron.sql`

**Interfaces:**
- Consumes: rota `/api/automations/tick` publicada e `AUTOMATION_SECRET`.

- [ ] **Step 1: Guardar segredo e URL fora do alcance da API**

```sql
create table if not exists private.automation_config (
  id boolean primary key default true check (id),
  tick_url text not null,
  secret text not null
);
-- valores reais preenchidos pelo usuário no SQL Editor:
insert into private.automation_config (id, tick_url, secret)
values (true, 'https://SEU-DOMINIO/api/automations/tick', 'SEGREDO_AQUI')
on conflict (id) do update set tick_url = excluded.tick_url, secret = excluded.secret;
```

- [ ] **Step 2: Função que chama a rota**

```sql
create or replace function private.automation_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  cfg record;
begin
  select * into cfg from private.automation_config where id;
  if not found then return; end if;
  perform net.http_post(
    url := cfg.tick_url,
    headers := jsonb_build_object('Content-Type','application/json','x-automation-secret', cfg.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;
```

- [ ] **Step 3: Agendar a cada minuto**

```sql
select cron.schedule('crm-automation-tick', '* * * * *', $$select private.automation_tick()$$);
```

- [ ] **Step 4: Verificar**

```sql
select jobname, schedule, active from cron.job;
select status, count(*) from net._http_response
where created > now() - interval '5 minutes' group by status;
```
Esperado: job `crm-automation-tick` ativo e respostas `200`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_automation_cron.sql
git commit -m "feat(automacoes): agendamento pg_cron chamando o motor a cada minuto"
```

---

### Task 5: Builder com configuração real

**Files:**
- Modify: `src/components/automations/node-catalog.ts`, `src/components/automations/workflow-builder.tsx`, `src/components/automations/node-picker.tsx`, `src/app/(app)/automacoes/[id]/page.tsx`
- Create: `src/components/automations/step-config-dialog.tsx`, `src/components/automations/trigger-config-dialog.tsx`
- Modify: `src/lib/data/repos/db/workflows.ts` (criar se não existir)

**Interfaces:**
- Produces: `useDbWorkflows()`, `useDbWorkflow(id)`, `workflowDbActions.{create,rename,setTrigger,setSteps,toggleStatus,remove,runManual}`.

- [ ] **Step 1: Catálogo alinhado ao motor**

Reescrever `node-catalog.ts` com os gatilhos da spec (`contato-criado`, `tag-adicionada`, `contato-atualizado`, `oportunidade-criada`, `fase-alterada`, `oportunidade-ganha`, `oportunidade-perdida`, `cliente-respondeu`, `compromisso-agendado`, `aniversario`) e as ações da Task 3, cada um com `fields: { key, label, type: "text"|"textarea"|"number"|"select"|"stage"|"user"|"tag" }` descrevendo o formulário de configuração.

- [ ] **Step 2: Repo real de workflows**

`db/workflows.ts` no padrão dos outros repos db (store Zustand + ações), carregando `workflows` da location e salvando `trigger_key`, `trigger_config`, `steps`, `status`.

- [ ] **Step 3: Diálogos de configuração**

`trigger-config-dialog.tsx` e `step-config-dialog.tsx` renderizam os campos do catálogo (Select de fase/pipeline/usuário busca dados reais dos repos db) e salvam no workflow.

- [ ] **Step 4: Builder consumindo o repo real**

Nós clicáveis abrem o diálogo; toggle Publicar/Rascunho chama `toggleStatus`; nó de trigger mostra o resumo da configuração ("Fase alterada → ASSINOU").

- [ ] **Step 5: Verificar**

Criar fluxo: gatilho "Tag adicionada = quente" → ação "Adicionar tag: prioridade". Publicar. Adicionar a tag `quente` a um contato em Contatos. Aguardar 1 minuto e conferir em `automation_runs` (status `done`) e nas tags do contato.

- [ ] **Step 6: Commit**

```bash
git add src/components/automations src/lib/data/repos/db/workflows.ts "src/app/(app)/automacoes"
git commit -m "feat(automacoes): builder com configuração real de gatilho e ações"
```

---

### Task 6: Execuções, logs e teste manual

**Files:**
- Create: `src/lib/data/repos/db/automation-runs.ts`, `src/components/automations/runs-tab.tsx`, `src/app/api/automations/run-now/route.ts`
- Modify: `src/app/(app)/automacoes/page.tsx`, `src/app/(app)/automacoes/[id]/page.tsx`

**Interfaces:**
- Produces: `useAutomationRuns(workflowId?)`, `useRunLogs(runId)`; rota `POST /api/automations/run-now` (sessão autenticada; body `{ workflowId, contactId }`).

- [ ] **Step 1: Repo de execuções**

Hooks lendo `automation_runs` e `automation_logs` da location (RLS já garante o escopo).

- [ ] **Step 2: Aba Execuções**

Tabela: status (badge), fluxo, contato, início, duração; clicar abre painel lateral com os passos e o resultado de cada um.

- [ ] **Step 3: Teste manual**

Rota `run-now` valida sessão com `getUser()`, confirma que o contato e o workflow são da location do usuário, insere um `automation_run` com `event_key = 'manual:<uuid>'` e chama `processDueRuns()` na hora. Botão "Testar fluxo" no builder abre seletor de contato.

- [ ] **Step 4: Verificar**

Rodar teste manual e ver o run aparecer com os logs em segundos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/repos/db/automation-runs.ts src/components/automations/runs-tab.tsx src/app/api/automations/run-now "src/app/(app)/automacoes"
git commit -m "feat(automacoes): aba de execuções com logs e teste manual"
```

---

### Task 7: Modelos prontos

**Files:**
- Create: `src/components/automations/templates.ts`, `src/components/automations/templates-gallery.tsx`
- Modify: `src/app/(app)/automacoes/page.tsx`

**Interfaces:**
- Consumes: `workflowDbActions.create` + `setTrigger`/`setSteps`.

- [ ] **Step 1: Definir os 5 modelos**

Cada um com nome, descrição, `trigger_key`, `trigger_config` e `steps` prontos:
1. **Boas-vindas ao novo lead** — contato criado → esperar 1min → e-mail de boas-vindas → tag `novo-lead`.
2. **Follow-up sem resposta (2 dias)** — oportunidade criada → esperar 2 dias → condição (tag `respondeu` ausente) → e-mail de follow-up + tarefa "Ligar".
3. **Mover para Perdido (7 dias)** — fase alterada para NOVO LEAD → esperar 7 dias → condição → mover fase para PERDIDO.
4. **Parabéns por assinatura** — oportunidade ganha → e-mail de agradecimento → tag `assinante` → tarefa de onboarding.
5. **Lembrete de reunião (24h antes)** — compromisso agendado → esperar até 24h antes → e-mail de lembrete.

- [ ] **Step 2: Galeria**

Cards com nome, descrição e o que o fluxo faz; botão "Usar este modelo" cria o workflow como rascunho e abre o builder.

- [ ] **Step 3: Verificar**

Criar a partir de um modelo, publicar e disparar o gatilho correspondente; conferir execução.

- [ ] **Step 4: Commit**

```bash
git add src/components/automations/templates.ts src/components/automations/templates-gallery.tsx "src/app/(app)/automacoes/page.tsx"
git commit -m "feat(automacoes): galeria de modelos prontos"
```

---

### Task 8: Verificação final, produção e documentação

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Build limpo**

```bash
npm run build
```

- [ ] **Step 2: Env vars em produção**

```bash
printf '<service_role_key>' | vercel env add SUPABASE_SERVICE_ROLE_KEY production
printf '<segredo>' | vercel env add AUTOMATION_SECRET production
```
(repetir para `preview` e `development`)

- [ ] **Step 3: Deploy e teste de ponta a ponta**

```bash
vercel deploy --prod --yes
```
Depois: adicionar tag em um contato pelo app em produção e conferir `automation_runs`/`automation_logs`.

- [ ] **Step 4: Documentar no AGENTS.md**

Nova seção "Automações (motor)": arquitetura, tabelas, como adicionar gatilho/ação novos, variáveis de ambiente e como pausar o cron (`select cron.unschedule('crm-automation-tick')`).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: motor de automações (arquitetura, operação e extensão)"
```
