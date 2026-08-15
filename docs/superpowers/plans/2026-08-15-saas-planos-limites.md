# SaaS multi-empresa: planos e limites — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que empresas se cadastrem sozinhas no CRM ON, cada uma isolada, com limites de usuários, canais de WhatsApp e módulos definidos por empresa e editáveis só pelo dono da plataforma.

**Architecture:** Tabela `public.location_limits` separada da `locations` (que é escrevível pelo admin do tenant), sem policy de escrita para `authenticated`. Limites numéricos aplicados por trigger no Postgres; limite de módulo aplicado em três camadas — `canAccess` no front, guarda de rota no shell, e recusa nas rotas de API que gastam dinheiro.

**Tech Stack:** Postgres/Supabase (RLS, triggers, `security definer`), Next.js 16 App Router, TypeScript, Zustand.

## Global Constraints

- Migrações **idempotentes**: `create ... if not exists`, `drop policy if exists`, `drop trigger if exists`.
- Migração nova entra em `supabase/migrations/` **e** é registrada em `scripts/gerar-setup.ps1`, seguido de `powershell -NoProfile -File scripts/gerar-setup.ps1`. O script falha de propósito se alguma migração ficar sem classificar.
- **Próximo número livre: `0046`.** Confira antes de criar: `Get-ChildItem supabase/migrations -Name | Select-Object -Last 1`.
- Toda tabela de domínio tem `location_id` e RLS deny-by-default. Helpers de tenant: `private.user_locations()` e `private.is_admin(uuid)`, ambos `security definer`.
- Texto de UI em **pt-BR**. Nome do produto só via `lib/config/brand.ts`.
- Base UI, **não Radix**: `PopoverTrigger`/`DropdownMenuTrigger` não aceitam `asChild`; use `render={<Button />}`.
- Zustand: nunca filtrar/mapear dentro do selector (loop infinito). Selecione o array cru e derive com `useMemo`.
- Commits em português: `feat(modulo): descrição`.
- **Verificação:** este projeto não tem test runner (sem vitest/jest, sem `npm test`). A verificação de cada tarefa é: asserção SQL que levanta exceção quando falha, `npm run build` (que faz o type check), e checagem no navegador. Não invente `npm test`.

### Como rodar as asserções SQL

Cole o bloco no **SQL Editor do Supabase** e execute. Os blocos usam `do $$ ... end $$;` com `raise exception` — se nada aparecer em vermelho, passou. Se aparecer `ERROR: ...`, a asserção falhou e a tarefa não está pronta.

---

### Task 1: Migração 0046 — tabela `location_limits`, RLS e semente

**Files:**
- Create: `supabase/migrations/0046_location_limits.sql`
- Modify: `scripts/gerar-setup.ps1` (lista da parte `04_departamentos_painel_agenda`)

**Interfaces:**
- Produces: tabela `public.location_limits (location_id uuid pk, max_users int, max_whatsapp_channels int, disabled_modules text[], notes text, updated_at timestamptz)`. `null` em `max_*` = ilimitado. Trigger `seed_limits_on_location` cria a linha padrão para toda `location` nova.

- [ ] **Step 1: Criar a migração**

Crie `supabase/migrations/0046_location_limits.sql`:

```sql
-- ============================================================
-- 0046 — Limites por empresa (camada de plataforma)
--
-- Tabela SEPARADA de public.locations de propósito. A locations tem
-- "admin edita location" (0001) com using/with check private.is_admin(id),
-- então qualquer coluna de limite guardada lá seria escrevível pelo admin
-- do próprio cliente via API — sem precisar de botão na tela.
--
-- Aqui: membro LÊ (a UI precisa explicar o bloqueio), ninguém com papel
-- authenticated ESCREVE. Só a service_role, ou seja, o dono da plataforma
-- pelo SQL Editor.
-- ============================================================

create table if not exists public.location_limits (
  location_id           uuid primary key references public.locations (id) on delete cascade,
  max_users             int,
  max_whatsapp_channels int,
  disabled_modules      text[] not null default '{}',
  notes                 text,
  updated_at            timestamptz not null default now()
);

alter table public.location_limits enable row level security;

revoke all on public.location_limits from anon;

-- Só SELECT. A ausência de policy de insert/update/delete é a proteção:
-- RLS é deny-by-default, então authenticated não escreve de jeito nenhum.
drop policy if exists "membros leem os limites da sua empresa" on public.location_limits;
create policy "membros leem os limites da sua empresa" on public.location_limits
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ------------------------------------------------------------
-- Semente da empresa nova
--
-- disabled_modules é lista de BLOQUEIO, não de liberação: módulo novo do
-- produto nasce disponível para todo mundo. Com lista de liberação, todo
-- módulo novo ficaria invisível para as empresas existentes.
--
-- Os quatro bloqueados consomem credenciais GLOBAIS (OPENAI_API_KEY,
-- RESEND_API_KEY, WHATSAPP_TOKEN): o consumo de qualquer cliente cai na
-- conta do dono da plataforma. Nascem desligados; o dono liga quando o
-- cliente vira pagante.
-- ------------------------------------------------------------
create or replace function private.seed_location_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_limits (location_id, disabled_modules)
  values (new.id, '{ai-studio,agentes-ia,marketing,whatsapp}')
  on conflict (location_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_location_limits() from public, anon, authenticated;

-- Trigger próprio em vez de editar private.on_location_created (0033):
-- mesmo padrão aditivo que a 0033 usou para não reescrever handle_new_user.
drop trigger if exists seed_limits_on_location on public.locations;
create trigger seed_limits_on_location
  after insert on public.locations
  for each row execute function private.seed_location_limits();

-- Empresas que já existem antes desta migração.
insert into public.location_limits (location_id, disabled_modules)
select id, '{ai-studio,agentes-ia,marketing,whatsapp}'
  from public.locations
on conflict (location_id) do nothing;

grant select on public.location_limits to authenticated;
grant all privileges on public.location_limits to service_role;
```

- [ ] **Step 2: Registrar no gerador**

Em `scripts/gerar-setup.ps1`, na lista `"04_departamentos_painel_agenda"`, depois de `"0045_remove_marca_antiga.sql"`:

```powershell
    "0045_remove_marca_antiga.sql",
    "0046_location_limits.sql"
```

- [ ] **Step 3: Regerar o setup**

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: lista as 4 partes sem lançar exceção. Se disser "Migracao sem classificacao neste script", o Step 2 não foi feito.

- [ ] **Step 4: Aplicar no banco**

Cole o conteúdo de `supabase/migrations/0046_location_limits.sql` no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 5: Verificar — a linha padrão existe e o tenant não consegue escrever**

Cole no SQL Editor:

```sql
do $$
declare
  n int;
  mods text[];
begin
  select count(*) into n from public.location_limits;
  if n = 0 then
    raise exception 'FALHOU: nenhuma linha em location_limits (a semente das empresas existentes nao rodou)';
  end if;

  select disabled_modules into mods from public.location_limits limit 1;
  if not (mods @> '{ai-studio,agentes-ia,marketing,whatsapp}') then
    raise exception 'FALHOU: modulos caros nao vieram bloqueados, veio %', mods;
  end if;

  -- A protecao real: nenhuma policy de escrita para authenticated.
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename = 'location_limits'
     and cmd in ('INSERT', 'UPDATE', 'DELETE');
  if n > 0 then
    raise exception 'FALHOU: existe policy de escrita em location_limits, o tenant pode alterar o proprio limite';
  end if;

  raise notice 'OK: location_limits criada, semeada e sem escrita para o tenant';
end $$;
```

Expected: `NOTICE: OK: ...`. Qualquer `ERROR:` significa que a tarefa não está pronta.

- [ ] **Step 6: Verificar — empresa nova nasce com a linha**

```sql
do $$
declare
  loc uuid;
  n int;
begin
  insert into public.locations (name) values ('__teste_limites__') returning id into loc;
  select count(*) into n from public.location_limits where location_id = loc;
  delete from public.locations where id = loc;
  if n <> 1 then
    raise exception 'FALHOU: o trigger seed_limits_on_location nao criou a linha da empresa nova';
  end if;
  raise notice 'OK: empresa nova nasce com limites';
end $$;
```

Expected: `NOTICE: OK: empresa nova nasce com limites`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0046_location_limits.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(planos): tabela location_limits fora do alcance de escrita do tenant"
```

---

### Task 2: Trigger de limite de usuários (membros e convites)

**Files:**
- Create: `supabase/migrations/0047_limite_usuarios.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Consumes: `public.location_limits.max_users` (Task 1).
- Produces: função `private.enforce_user_limit()`, triggers `enforce_user_limit_members` em `location_members` e `enforce_user_limit_invites` em `invitations`. Erro levantado: `LIMITE_USUARIOS`.

- [ ] **Step 1: Criar a migração**

Crie `supabase/migrations/0047_limite_usuarios.sql`:

```sql
-- ============================================================
-- 0047 — Limite de usuários por empresa
--
-- Barra nos DOIS pontos, de propósito:
--   * location_members — a entrada de fato
--   * invitations      — senão o admin cria convites à vontade e a falha
--                        aparece para o CONVIDADO, no meio do cadastro dele
--
-- A contagem soma membros + convites PENDENTES. Ignorar os pendentes
-- deixaria estourar o limite disparando vários convites antes de qualquer
-- um ser aceito.
--
-- No banco e não na tela: o admin do cliente tem sessão válida e chama a
-- API direto. Mesma lição da 0040 (esconder o botão nao impedia o delete).
-- ============================================================

create or replace function private.enforce_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
  loc   uuid := new.location_id;
begin
  select max_users into lim from public.location_limits where location_id = loc;

  -- null = ilimitado. Zero é diferente de null e bloqueia.
  if lim is null then
    return new;
  end if;

  select (select count(*) from public.location_members where location_id = loc)
       + (select count(*) from public.invitations
           where location_id = loc and status = 'pending')
    into atual;

  if atual >= lim then
    raise exception 'LIMITE_USUARIOS: esta empresa atingiu o limite de % usuarios (membros + convites pendentes)', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_user_limit() from public, anon, authenticated;

drop trigger if exists enforce_user_limit_members on public.location_members;
create trigger enforce_user_limit_members
  before insert on public.location_members
  for each row execute function private.enforce_user_limit();

drop trigger if exists enforce_user_limit_invites on public.invitations;
create trigger enforce_user_limit_invites
  before insert on public.invitations
  for each row execute function private.enforce_user_limit();
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0047_limite_usuarios.sql"` à lista `"04_departamentos_painel_agenda"` em `scripts/gerar-setup.ps1`, depois:

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes listadas, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole `supabase/migrations/0047_limite_usuarios.sql` no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar — o limite barra, e null não barra**

```sql
do $$
declare
  loc uuid;
  barrou boolean := false;
begin
  insert into public.locations (name) values ('__teste_limite_user__') returning id into loc;

  -- Com limite 0, o proximo convite tem que ser recusado.
  update public.location_limits set max_users = 0 where location_id = loc;
  begin
    insert into public.invitations (location_id, email, role, status)
    values (loc, 'x@exemplo.com', 'user', 'pending');
  exception when check_violation then
    barrou := true;
  end;
  if not barrou then
    raise exception 'FALHOU: convite passou mesmo com max_users = 0';
  end if;

  -- Com null (ilimitado), tem que passar.
  update public.location_limits set max_users = null where location_id = loc;
  insert into public.invitations (location_id, email, role, status)
  values (loc, 'y@exemplo.com', 'user', 'pending');

  delete from public.locations where id = loc;
  raise notice 'OK: limite de usuarios barra em 0 e libera em null';
end $$;
```

Expected: `NOTICE: OK: limite de usuarios barra em 0 e libera em null`.

> Se der erro de coluna inexistente em `invitations`, rode
> `select column_name from information_schema.columns where table_name = 'invitations';`
> e ajuste os campos do insert de teste — o trigger em si não muda.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0047_limite_usuarios.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(planos): limite de usuarios por empresa, barrando tambem no convite"
```

---

### Task 3: Trigger de limite de canais de WhatsApp

**Files:**
- Create: `supabase/migrations/0048_limite_canais.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Consumes: `public.location_limits.max_whatsapp_channels` (Task 1).
- Produces: `private.enforce_channel_limit()` + trigger `enforce_channel_limit_ins` em `whatsapp_channels`. Erro: `LIMITE_CANAIS`.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0048 — Limite de canais de WhatsApp por empresa
--
-- O insert vem direto do client Supabase (db/whatsapp.ts), então o erro
-- do trigger sobe para a UI sozinho, sem rota intermediária.
-- ============================================================

create or replace function private.enforce_channel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
begin
  select max_whatsapp_channels into lim
    from public.location_limits where location_id = new.location_id;

  if lim is null then
    return new;
  end if;

  select count(*) into atual
    from public.whatsapp_channels where location_id = new.location_id;

  if atual >= lim then
    raise exception 'LIMITE_CANAIS: esta empresa atingiu o limite de % numeros de WhatsApp', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_channel_limit() from public, anon, authenticated;

drop trigger if exists enforce_channel_limit_ins on public.whatsapp_channels;
create trigger enforce_channel_limit_ins
  before insert on public.whatsapp_channels
  for each row execute function private.enforce_channel_limit();
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0048_limite_canais.sql"` à lista `"04_departamentos_painel_agenda"`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole a migração no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar**

```sql
do $$
declare
  loc uuid;
  barrou boolean := false;
begin
  insert into public.locations (name) values ('__teste_limite_canal__') returning id into loc;
  update public.location_limits set max_whatsapp_channels = 0 where location_id = loc;

  begin
    insert into public.whatsapp_channels (location_id, name, phone_number_id, waba_id)
    values (loc, 'teste', 'pn_teste_0048', 'waba_teste_0048');
  exception when check_violation then
    barrou := true;
  end;

  delete from public.locations where id = loc;
  if not barrou then
    raise exception 'FALHOU: canal criado mesmo com max_whatsapp_channels = 0';
  end if;
  raise notice 'OK: limite de canais barra';
end $$;
```

Expected: `NOTICE: OK: limite de canais barra`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0048_limite_canais.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(planos): limite de numeros de WhatsApp por empresa"
```

---

### Task 4: Repo de limites no front e precedência no `canAccess`

**Files:**
- Create: `src/lib/data/repos/db/limits.ts`
- Modify: `src/lib/data/repos/db/team.ts:61-85` (assinatura de `canAccess`), `src/lib/data/repos/db/team.ts:210-228` (`useMyMembership`)

**Interfaces:**
- Consumes: tabela `location_limits` (Task 1).
- Produces:
  - `useLimits(): { loaded: boolean; maxUsers: number | null; maxWhatsappChannels: number | null; disabledModules: string[] }`
  - `canAccess(moduleKey: string, member, departments, disabledModules?: string[]): boolean` — 4º parâmetro **opcional**, default `[]`, para não quebrar as chamadas existentes em `configuracoes/departamentos/page.tsx`.
  - `useMyMembership()` ganha `planBlocks(moduleKey: string): boolean`.

- [ ] **Step 1: Criar o repo de limites**

Crie `src/lib/data/repos/db/limits.ts`, seguindo o padrão dos outros repos `db/`:

```ts
"use client";

import { create } from "zustand";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

export interface Limits {
  maxUsers: number | null;
  maxWhatsappChannels: number | null;
  disabledModules: string[];
}

const SEM_LIMITE: Limits = {
  maxUsers: null,
  maxWhatsappChannels: null,
  disabledModules: [],
};

interface LimitsState {
  limits: Limits;
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
}

export const useLimitsStore = create<LimitsState>((set, get) => ({
  limits: SEM_LIMITE,
  loaded: false,
  loading: false,
  async load(force = false) {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    // Sem location resolvida ainda: NÃO marca loaded, senão cacheia vazio
    // para sempre. Mesma corrida que já mordeu em db/whatsapp.ts.
    if (!locationId) {
      set({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("location_limits")
      .select("max_users, max_whatsapp_channels, disabled_modules")
      .eq("location_id", locationId)
      .maybeSingle();
    set({
      limits: data
        ? {
            maxUsers: data.max_users ?? null,
            maxWhatsappChannels: data.max_whatsapp_channels ?? null,
            disabledModules: data.disabled_modules ?? [],
          }
        : SEM_LIMITE,
      loaded: true,
      loading: false,
    });
  },
}));

/** Limites da empresa do usuário logado. */
export function useLimits() {
  const { limits, loaded, load } = useLimitsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { loaded, ...limits };
}
```

> O `useDbStore` fica mesmo em `db/contacts.ts:39` (verificado) — é de lá que os outros repos `db/` importam `locationId`. O import acima está correto como está.

- [ ] **Step 2: Dar precedência de plano ao `canAccess`**

Em `src/lib/data/repos/db/team.ts`, substitua a função `canAccess` (linhas 57-74) por:

```ts
/**
 * Acesso efetivo a um módulo:
 * plano bloqueou → admin vê tudo → exceção individual → departamento → libera.
 *
 * O plano vem ANTES do admin de propósito. Se viesse depois, o admin da
 * empresa cliente se daria permissão sozinho e usaria um módulo que o dono
 * da plataforma não liberou.
 */
export function canAccess(
  moduleKey: string,
  member: Pick<TeamMember, "role" | "permissions" | "departmentId"> | null,
  departments: Department[],
  disabledModules: string[] = []
): boolean {
  if (disabledModules.includes(moduleKey)) return false;
  if (!member) return true;
  if (member.role === "admin") return true;
  const own = member.permissions?.[moduleKey];
  if (typeof own === "boolean") return own;
  const dep = departments.find((d) => d.id === member.departmentId);
  const fromDep = dep?.permissions?.[moduleKey];
  if (typeof fromDep === "boolean") return fromDep;
  return true;
}
```

- [ ] **Step 3: Ligar o plano no `useMyMembership`**

Em `src/lib/data/repos/db/team.ts`, acrescente o import no topo:

```ts
import { useLimitsStore } from "./limits";
```

E substitua o corpo de `useMyMembership` (linhas 210-228) por:

```ts
export function useMyMembership() {
  const { members, departments, loaded, load } = useTeamStore();
  const userId = useDbStore((s) => s.userId);
  const disabledModules = useLimitsStore((s) => s.limits.disabledModules);
  const loadLimits = useLimitsStore((s) => s.load);
  useEffect(() => {
    void load();
    void loadLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => {
    const me = members.find((m) => m.userId === userId) ?? null;
    return {
      loaded,
      me,
      isAdmin: me?.role === "admin",
      department: departments.find((d) => d.id === me?.departmentId) ?? null,
      /** Plano → admin → exceção individual → departamento → libera. */
      can: (moduleKey: string) => canAccess(moduleKey, me, departments, disabledModules),
      /** True quando é o PLANO que bloqueia (mensagem diferente da de permissão). */
      planBlocks: (moduleKey: string) => disabledModules.includes(moduleKey),
    };
  }, [members, departments, userId, loaded, disabledModules]);
}
```

> `disabledModules` é selecionado cru do store, sem `.filter`/`.map` dentro do selector — derivar ali cria array novo a cada render e dá loop infinito.

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: build completo sem erro de tipo. Se acusar erro em `configuracoes/departamentos/page.tsx`, é porque o 4º parâmetro não ficou opcional — volte ao Step 2.

- [ ] **Step 5: Verificar na tela**

Com o app rodando (`npm run dev`), abra `http://localhost:3000` e faça login.
Expected: **AI Studio, Agentes de IA, Marketing e WhatsApp sumiram da sidebar** (a empresa nasceu com eles bloqueados). Os outros 14 continuam.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/repos/db/limits.ts src/lib/data/repos/db/team.ts
git commit -m "feat(planos): limite de modulos com precedencia sobre o admin do tenant"
```

---

### Task 5: Guarda de rota

**Files:**
- Create: `src/components/layout/module-guard.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `useMyMembership()` com `can` e `planBlocks` (Task 4), `NAV_ITEMS` de `@/lib/config/nav`.
- Produces: `<ModuleGuard>{children}</ModuleGuard>` — envolve o `<main>` e troca o conteúdo por um aviso quando o módulo da rota atual está bloqueado.

Hoje `can()` só filtra a sidebar (`components/layout/sidebar.tsx:83`). Digitar `/marketing` na URL renderiza a página normalmente — lacuna que já vale para as permissões de departamento atuais.

- [ ] **Step 1: Criar o componente**

Crie `src/components/layout/module-guard.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/config/nav";
import { useMyMembership } from "@/lib/data/repos/db/team";

/**
 * Guarda de ROTA. A sidebar já esconde o item, mas esconder link não impede
 * navegação direta pela URL.
 *
 * Isto é UX, não segurança: quem protege de verdade são os triggers do banco
 * e as checagens nas rotas de API. Aqui a função é explicar o bloqueio.
 */
export function ModuleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loaded, can, planBlocks } = useMyMembership();

  const item = NAV_ITEMS.find((i) => pathname.startsWith(i.href));

  // Sem item mapeado (ex.: /configuracoes) ou membership ainda carregando:
  // deixa passar. Bloquear durante o load faria a tela piscar "sem acesso".
  if (!item || !loaded) return <>{children}</>;
  if (can(item.key)) return <>{children}</>;

  const porPlano = planBlocks(item.key);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center">
        <Lock className="mx-auto mb-3 size-8 text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900">
          {porPlano ? "Módulo não incluído no seu plano" : "Sem acesso a este módulo"}
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          {porPlano
            ? `O módulo ${item.label} não faz parte do plano desta empresa. Fale com o suporte para liberar.`
            : `Você não tem permissão para acessar ${item.label}. Peça a um administrador da sua empresa.`}
        </p>
      </div>
    </div>
  );
}
```

> As duas mensagens são diferentes de propósito: no bloqueio por plano a pessoa precisa falar com o fornecedor; no bloqueio por permissão, com o próprio admin. Uma mensagem genérica mandaria metade dos usuários para o lugar errado.

- [ ] **Step 2: Montar no shell**

Em `src/app/(app)/layout.tsx`, importe e envolva o conteúdo do `<main>`:

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SessionManager } from "@/components/layout/session-manager";
import { AppointmentReminders } from "@/components/calendar/appointment-reminders";
import { ModuleGuard } from "@/components/layout/module-guard";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SessionManager />
      {/* Lembrete de compromisso (0042): fica no shell para avisar em qualquer
          tela — um aviso que só aparece com o Calendário aberto não serviria. */}
      <AppointmentReminders />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <ModuleGuard>{children}</ModuleGuard>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 4: Verificar na tela**

Com `npm run dev`, logado, digite `http://localhost:3000/marketing` na barra de endereço.
Expected: o cartão **"Módulo não incluído no seu plano"** aparece, não a tela de Marketing.

Depois libere o módulo e confirme que volta:

```sql
update public.location_limits
   set disabled_modules = '{ai-studio,agentes-ia,whatsapp}'
 where location_id = (select id from public.locations limit 1);
```

Recarregue a página.
Expected: a tela de Marketing carrega e o item volta à sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/module-guard.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(planos): guarda de rota separando bloqueio por plano de bloqueio por permissao"
```

---

### Task 6: Recusa server-side nas rotas que gastam dinheiro

**Files:**
- Create: `src/lib/plan/guard.ts`
- Modify: `src/app/api/ai/generate/route.ts`, `src/app/api/ai/chat/route.ts`, `src/app/api/marketing/campaigns/[id]/send/route.ts`, `src/app/api/marketing/campaigns/[id]/test/route.ts`

**Interfaces:**
- Consumes: `location_limits.disabled_modules` (Task 1).
- Produces: `assertModuleEnabled(locationId: string, moduleKey: string): Promise<string | null>` — devolve `null` quando liberado, ou a mensagem de erro quando bloqueado.

A guarda de rota da Task 5 é contornável (é client-side). Estas rotas queimam `OPENAI_API_KEY` e `RESEND_API_KEY`, que são **globais** — o consumo cai na conta do dono da plataforma. Precisam recusar no servidor.

- [ ] **Step 1: Criar o helper**

Crie `src/lib/plan/guard.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recusa server-side de módulo bloqueado pelo plano.
 *
 * Lê com a service role de propósito: location_limits não tem policy de
 * escrita, mas a leitura com a sessão do usuário dependeria da RLS e de o
 * chamador ter membership resolvida. Aqui a autorização já aconteceu antes
 * (a rota validou a sessão); isto é só consulta de configuração.
 *
 * Devolve null quando liberado, ou a mensagem quando bloqueado.
 */
export async function assertModuleEnabled(
  locationId: string,
  moduleKey: string
): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("location_limits")
    .select("disabled_modules")
    .eq("location_id", locationId)
    .maybeSingle();

  const bloqueados: string[] = data?.disabled_modules ?? [];
  if (bloqueados.includes(moduleKey)) {
    return `O módulo ${moduleKey} não está incluído no plano desta empresa.`;
  }
  return null;
}
```

- [ ] **Step 2: Aplicar em `/api/ai/generate`**

A rota já resolve `locationId` na linha 33, antes de chamar a OpenAI na linha 42.
Insira o bloco **entre as duas** — logo depois de `const locationId = ...`:

```ts
  // Plano: recusa antes de gastar credencial global. Sem empresa resolvida
  // também recusa — não dá para saber que plano aplicar, e liberar "na
  // dúvida" seria consumo anônimo na conta do dono da plataforma.
  if (!locationId) {
    return Response.json({ error: "Empresa não encontrada" }, { status: 403 });
  }
  const bloqueio = await assertModuleEnabled(locationId, "ai-studio");
  if (bloqueio) {
    return Response.json({ error: bloqueio }, { status: 403 });
  }
```

E o import no topo:

```ts
import { assertModuleEnabled } from "@/lib/plan/guard";
```

> Atenção: hoje a rota tolera `locationId` nulo (só pula o `ai_logs` na linha 53).
> Com o plano, nulo passa a ser recusa — é mudança de comportamento intencional.

- [ ] **Step 3: Aplicar nas outras três rotas**

Em cada arquivo, o mesmo import no topo e o mesmo bloco, mudando só a chave.
Insira depois de a rota ter `locationId` em mãos e antes da chamada externa
(OpenAI ou Resend):

```ts
import { assertModuleEnabled } from "@/lib/plan/guard";
```

```ts
  if (!locationId) {
    return Response.json({ error: "Empresa não encontrada" }, { status: 403 });
  }
  const bloqueio = await assertModuleEnabled(locationId, "AQUI_A_CHAVE");
  if (bloqueio) {
    return Response.json({ error: bloqueio }, { status: 403 });
  }
```

Trocando `AQUI_A_CHAVE` por:

| Arquivo | Chave |
|---|---|
| `src/app/api/ai/chat/route.ts` | `"agentes-ia"` |
| `src/app/api/marketing/campaigns/[id]/send/route.ts` | `"marketing"` |
| `src/app/api/marketing/campaigns/[id]/test/route.ts` | `"marketing"` |

Se a rota nomear a variável de outro jeito (ex.: `locId`, `membership.location_id`),
use o nome dela — não crie uma segunda consulta de membership.

> Se alguma rota não tiver `locationId` à mão, resolva com a mesma consulta que ela já usa para checar membership. Não invente um `location_id` vindo do corpo do request: o cliente controlaria qual empresa está sendo checada.

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 5: Verificar a recusa**

Garanta que o módulo está bloqueado:

```sql
update public.location_limits
   set disabled_modules = '{ai-studio,agentes-ia,marketing,whatsapp}'
 where location_id = (select id from public.locations limit 1);
```

Com `npm run dev` e logado, no console do navegador (F12):

```js
await (await fetch("/api/ai/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "oi", feature: "teste" }),
})).json()
```

Expected: `{ error: "O módulo ai-studio não está incluído no plano desta empresa." }` com status 403 — não uma resposta da OpenAI.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan/guard.ts src/app/api/ai src/app/api/marketing
git commit -m "feat(planos): recusa server-side nas rotas de IA e marketing"
```

---

### Task 7: Abrir o cadastro público e documentar a operação

**Files:**
- Modify: `AGENTS.md` (seção do banco), `supabase/setup/README.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.

- [ ] **Step 1: Confirmar que os limites estão de pé antes de abrir**

Não abra o cadastro antes disso passar — com o signup aberto e os módulos caros liberados, qualquer cadastro anônimo consome as credenciais globais do dono da plataforma.

```sql
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname in ('seed_limits_on_location', 'enforce_user_limit_members',
                    'enforce_user_limit_invites', 'enforce_channel_limit_ins');
  if n <> 4 then
    raise exception 'FALHOU: esperava 4 triggers de limite, achei %. NAO abra o cadastro', n;
  end if;
  raise notice 'OK: triggers de limite no lugar, pode abrir o cadastro';
end $$;
```

Expected: `NOTICE: OK: triggers de limite no lugar, pode abrir o cadastro`.

- [ ] **Step 2: Abrir o cadastro**

```sql
update private.app_settings set signup_mode = 'open';
select signup_mode from private.app_settings;
```

Expected: `open`.

- [ ] **Step 3: Testar o fluxo completo de uma empresa nova**

No navegador, em aba anônima, acesse `http://localhost:3000`, clique em **"Criar conta grátis"** e cadastre com um e-mail diferente do seu e um nome de empresa.

Expected:
- a conta é criada e entra no CRM
- a sidebar mostra 14 módulos, **sem** AI Studio, Agentes de IA, Marketing e WhatsApp
- os dados da sua empresa original **não** aparecem em Contatos, Leads nem Conversas

Confirme o isolamento no SQL:

```sql
select l.name, count(m.user_id) as membros
  from public.locations l
  left join public.location_members m on m.location_id = l.id
 group by l.name;
```

Expected: duas empresas, cada uma com 1 membro.

- [ ] **Step 4: Documentar no AGENTS.md**

Primeiro atualize o contador — este plano gastou `0046`, `0047` e `0048`.
Em `AGENTS.md`, troque a linha do próximo número livre por:

```markdown
- **Próximo número livre: `0049`.**
```

Depois, no fim da seção "Banco (Supabase) e migrações", acrescente:

```markdown
### Planos e limites por empresa

`public.location_limits` guarda o limite de cada empresa: `max_users`,
`max_whatsapp_channels` (`null` = ilimitado) e `disabled_modules` (lista de
BLOQUEIO — módulo novo nasce liberado para todos).

Fica **fora** da `locations` porque aquela tabela é editável pelo admin do
próprio tenant; aqui não existe policy de escrita para `authenticated`, só a
service role escreve. Não crie uma: seria o cliente definindo o próprio plano.

Os limites numéricos são aplicados por trigger (`0047`, `0048`), não na tela —
o admin do cliente chama a API direto. O limite de módulo tem precedência
**sobre o admin** em `canAccess`, senão ele se autoriza sozinho.

Empresa nova nasce com `ai-studio`, `agentes-ia`, `marketing` e `whatsapp`
bloqueados: essas features consomem `OPENAI_API_KEY`, `RESEND_API_KEY` e
`WHATSAPP_TOKEN`, que são **globais** — o consumo de todo cliente cai na conta
do dono da plataforma. Liberar um módulo é assumir esse custo.

Ajustar um cliente:

​```sql
update public.location_limits
   set max_users = 5,
       disabled_modules = '{ai-studio}',
       notes = 'Plano combinado em <data>',
       updated_at = now()
 where location_id = '<uuid>';
​```
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md supabase/setup/README.md
git commit -m "docs(planos): operacao dos limites por empresa e abertura do cadastro"
```

---

## Notas de verificação

Este projeto não tem test runner. Se em algum momento adicionarem um, os
melhores candidatos a teste automatizado, em ordem de valor:

1. `canAccess` — função pura, 4 caminhos de decisão, e a precedência do plano
   sobre o admin é a regra que sustenta o modelo de negócio.
2. Os três triggers — hoje verificados por bloco `do $$` colado à mão. São a
   única proteção real contra o tenant furar o próprio limite.
3. `assertModuleEnabled` — recusa das rotas caras.
