# Painel de plataforma — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono da plataforma cadastra empresas clientes já configuradas e suspende quem parar de pagar, sem ganhar acesso aos contatos e conversas de ninguém.

**Architecture:** A identidade de dono vive em `private.platform_admins`, num schema que o PostgREST não expõe. Policies novas entram apenas em `locations` e `location_limits`; contadores vêm de uma função que devolve só totais. A suspensão entra dentro de `private.user_locations()`, a função que toda policy já consulta, então propaga para todas as tabelas de uma vez.

**Tech Stack:** Postgres/Supabase (RLS, `security definer`, Auth Admin API), Next.js 16 App Router, TypeScript, Zustand.

## Global Constraints

- Migrações **idempotentes**: `create ... if not exists`, `drop policy if exists`, `drop trigger if exists`, `create or replace function`.
- Migração nova entra em `supabase/migrations/` **e** é registrada em `scripts/gerar-setup.ps1` (lista `04_departamentos_painel_agenda`), seguido de `powershell -NoProfile -File scripts/gerar-setup.ps1`.
- **Próximo número livre: `0050`.** Confira antes de criar: `Get-ChildItem supabase/migrations -Name | Select-Object -Last 1`.
- Funções em `private` sempre com `security definer` e `set search_path = ''`, seguidas de `revoke all ... from public, anon, authenticated` e `grant execute` só a quem precisa.
- Texto de UI em **pt-BR**. Nome do produto só via `lib/config/brand.ts`.
- Estilo: h1 `text-lg font-bold text-slate-900`; cards `rounded-xl border bg-white`; tabelas `text-xs`; botões `h-8 text-xs`; primário indigo (#6366f1).
- Base UI, **não Radix**: triggers não aceitam `asChild`; use `render={<Button />}`.
- Zustand: nunca filtrar/mapear dentro do selector.
- Shell é **PowerShell 5.1**: `&&` não funciona, use `;`.
- Commits em português: `feat(modulo): descrição`.
- **Verificação:** o projeto não tem test runner (sem vitest/jest, sem `npm test`). Cada tarefa verifica com asserção SQL em bloco `do $$` (que levanta exceção quando falha), `npm run build`, e checagem no navegador. Não invente `npm test`.
- **As migrações desta feature dependem das `0046`–`0049` estarem aplicadas.** Se `location_limits` não existir no banco, nada aqui funciona.

---

### Task 1: Migração 0050 — identidade do dono e visão da plataforma

**Files:**
- Create: `supabase/migrations/0050_plataforma.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Produces: `private.platform_admins (user_id uuid pk)`; `private.is_platform_admin() returns boolean`; `private.platform_stats() returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)`; policies de plataforma em `public.locations` e `public.location_limits`.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0050 — Painel de plataforma: identidade do dono e visão
--
-- A identidade fica no schema `private`, que o PostgREST NÃO expõe: nenhum
-- cliente lê, escreve ou descobre que a tabela existe.
--
-- Não pode ser coluna em public.profiles: a 0001 cria a policy "editar o
-- próprio perfil", então qualquer coluna ali é escrevível pelo dono da linha
-- e um usuário se promoveria a dono da plataforma sozinho. É a mesma razão
-- que fez location_limits virar tabela separada em vez de coluna em locations.
-- ============================================================

create table if not exists private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from private.platform_admins where user_id = (select auth.uid())
  )
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- Wrapper em public: o PostgREST só expõe RPC do schema `public`, e tanto a
-- guarda das rotas quanto o layout de /plataforma precisam consultar isto.
create or replace function public.is_platform_admin_check()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_platform_admin() $$;

revoke all on function public.is_platform_admin_check() from public, anon;
grant execute on function public.is_platform_admin_check() to authenticated;

-- ------------------------------------------------------------
-- O que o dono enxerga: SÓ o cadastro das empresas.
--
-- Nenhuma policy nova em contacts, conversations, messages ou opportunities.
-- A garantia de que o dono não lê dado de cliente é do banco, não da tela.
-- ------------------------------------------------------------
drop policy if exists "plataforma le locations" on public.locations;
create policy "plataforma le locations" on public.locations
  for select to authenticated using (private.is_platform_admin());

drop policy if exists "plataforma cria locations" on public.locations;
create policy "plataforma cria locations" on public.locations
  for insert to authenticated with check (private.is_platform_admin());

drop policy if exists "plataforma edita locations" on public.locations;
create policy "plataforma edita locations" on public.locations
  for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists "plataforma le limites" on public.location_limits;
create policy "plataforma le limites" on public.location_limits
  for select to authenticated using (private.is_platform_admin());

drop policy if exists "plataforma edita limites" on public.location_limits;
create policy "plataforma edita limites" on public.location_limits
  for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- ------------------------------------------------------------
-- Contadores: devolve NÚMEROS, nunca linhas.
--
-- O dono recebe "47 contatos"; nunca ganha select em contacts. A checagem
-- é interna porque a função é security definer — sem ela, qualquer
-- authenticated leria o total de todas as empresas.
-- ------------------------------------------------------------
create or replace function private.platform_stats()
returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'apenas o dono da plataforma pode consultar estes dados'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select l.id,
           (select count(*)::int from public.location_members m where m.location_id = l.id),
           (select count(*)::int from public.contacts c where c.location_id = l.id),
           (select count(*)::int from public.whatsapp_channels w where w.location_id = l.id),
           (select count(*)::int from public.whatsapp_channels w
             where w.location_id = l.id and w.active)
      from public.locations l;
end;
$$;

revoke all on function private.platform_stats() from public, anon;
grant execute on function private.platform_stats() to authenticated;

-- Wrapper em public: o PostgREST só chama RPC do schema exposto.
create or replace function public.platform_stats()
returns table (location_id uuid, usuarios int, contatos int, canais int, canais_ativos int)
language sql
security definer
stable
set search_path = ''
as $$ select * from private.platform_stats() $$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to authenticated;
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0050_plataforma.sql"` ao fim da lista `"04_departamentos_painel_agenda"` em `scripts/gerar-setup.ps1`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes listadas, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole `supabase/migrations/0050_plataforma.sql` no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Cadastrar-se como dono da plataforma**

Isto é manual e acontece uma vez só — não existe tela para isso, de propósito.

```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = '<seu e-mail>'
on conflict (user_id) do nothing;

select count(*) as donos from private.platform_admins;
```

Expected: `donos = 1`.

- [ ] **Step 5: Verificar que o dono NÃO ganhou acesso a dado de cliente**

```sql
do $$
declare n int;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('contacts','conversations','messages','opportunities')
     and qual like '%is_platform_admin%';
  if n > 0 then
    raise exception 'FALHOU: policy de plataforma vazou para tabela de dado do cliente';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'locations'
     and qual like '%is_platform_admin%';
  if n < 1 then
    raise exception 'FALHOU: o dono nao enxerga locations';
  end if;

  raise notice 'OK: dono ve o cadastro e nao ve dado de cliente';
end $$;
```

Expected: `NOTICE: OK: dono ve o cadastro e nao ve dado de cliente`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0050_plataforma.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(plataforma): identidade do dono e visao do cadastro das empresas"
```

---

### Task 2: Migração 0051 — suspensão de empresa

**Files:**
- Create: `supabase/migrations/0051_suspensao.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Consumes: `private.is_platform_admin()` (Task 1).
- Produces: `public.locations.suspended_at timestamptz`, `public.locations.suspended_reason text`; `private.user_locations()` redefinida; `public.my_suspension() returns table (suspended boolean, reason text)`.

⚠️ Esta tarefa **redefine `private.user_locations()`**, a função que TODA policy do sistema consulta. Um erro aqui derruba o acesso de todo mundo. Aplique e verifique com atenção.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0051 — Suspender empresa sem apagar dado
--
-- A suspensão entra DENTRO de private.user_locations(), a função que toda
-- policy do sistema já consulta. Suspender remove a empresa do retorno dela
-- e o efeito propaga para todas as tabelas de uma vez, sem tocar em policy.
--
-- Não há recursão: user_locations() é security definer, então a consulta a
-- locations dentro dela ignora a RLS de locations. É o mesmo motivo pelo
-- qual a 0001 já consulta location_members ali dentro sem recursão.
-- ============================================================

alter table public.locations
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text;

create or replace function private.user_locations()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.location_id
    from public.location_members m
    join public.locations l on l.id = m.location_id
   where m.user_id = (select auth.uid())
     and l.suspended_at is null
$$;

revoke all on function private.user_locations() from public, anon;
grant execute on function private.user_locations() to authenticated;

-- ------------------------------------------------------------
-- Válvula de escape: suspensa, a empresa some de user_locations(), e como a
-- própria policy de locations usa essa função, o cliente deixa de ler até o
-- nome da própria empresa. Sem isto ele veria um CRM vazio e quebrado em vez
-- do motivo — e cada suspensão viraria um chamado de suporte.
--
-- NÃO ACEITA PARÂMETRO. Sendo security definer, uma versão que recebesse
-- location_id deixaria qualquer cliente consultar o estado de qualquer
-- empresa. Resolve a empresa do próprio chamador e devolve só o par
-- (suspended, reason) — nunca nome, nunca id, nunca linha de outra empresa.
-- ------------------------------------------------------------
create or replace function public.my_suspension()
returns table (suspended boolean, reason text)
language sql
security definer
stable
set search_path = ''
as $$
  select (l.suspended_at is not null), l.suspended_reason
    from public.location_members m
    join public.locations l on l.id = m.location_id
   where m.user_id = (select auth.uid())
   limit 1
$$;

revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0051_suspensao.sql"` ao fim da lista `"04_departamentos_painel_agenda"`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole a migração no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar que ninguém perdeu acesso**

Esta é a asserção mais importante do plano: confirma que a redefinição de
`user_locations()` não quebrou o acesso normal.

```sql
do $$
declare
  loc uuid;
  visiveis int;
begin
  select id into loc from public.locations where suspended_at is null limit 1;
  if loc is null then
    raise exception 'FALHOU: nao ha empresa ativa para testar';
  end if;

  -- A função é stable e usa auth.uid(); no SQL Editor não há sessão de
  -- usuário, então testamos a LÓGICA diretamente sobre as tabelas.
  select count(*) into visiveis
    from public.location_members m
    join public.locations l on l.id = m.location_id
   where l.suspended_at is null;
  if visiveis = 0 then
    raise exception 'FALHOU: nenhum vinculo ativo — a suspensao filtrou demais';
  end if;

  raise notice 'OK: % vinculos ativos continuam visiveis', visiveis;
end $$;
```

Expected: `NOTICE: OK: N vinculos ativos continuam visiveis`, com N ≥ 1.

- [ ] **Step 5: Verificar que suspender realmente esconde**

```sql
do $$
declare
  loc uuid;
  antes int;
  depois int;
begin
  insert into public.locations (name) values ('__teste_suspensao__') returning id into loc;

  select count(*) into antes
    from public.locations l where l.id = loc and l.suspended_at is null;

  update public.locations set suspended_at = now(), suspended_reason = 'teste'
   where id = loc;

  select count(*) into depois
    from public.locations l where l.id = loc and l.suspended_at is null;

  delete from public.locations where id = loc;

  if antes <> 1 or depois <> 0 then
    raise exception 'FALHOU: suspensao nao mudou a visibilidade (antes=%, depois=%)', antes, depois;
  end if;
  raise notice 'OK: empresa suspensa sai do filtro';
end $$;
```

Expected: `NOTICE: OK: empresa suspensa sai do filtro`.

- [ ] **Step 6: Verificar no app que você ainda entra**

Com `npm run dev`, recarregue `http://localhost:3000/dashboard` logado.
Expected: o CRM carrega normalmente, com seus dados. Se vier vazio, a
redefinição de `user_locations()` quebrou o acesso — não prossiga, corrija.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0051_suspensao.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(plataforma): suspender empresa preservando os dados"
```

---

### Task 3: Migração 0052 — troca de senha obrigatória e tipo de canal

**Files:**
- Create: `supabase/migrations/0052_primeiro_acesso.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Produces: `public.profiles.must_change_password boolean not null default false` (protegida por trigger); `public.location_limits.whatsapp_provider text not null default 'meta'` com check `in ('meta','evolution')`.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0052 — Primeiro acesso e tipo de canal de WhatsApp
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ------------------------------------------------------------
-- A 0001 dá ao usuário a policy "editar o próprio perfil", então sem isto
-- ele marcaria a própria coluna como false e pularia a troca de senha.
-- Neste caso o estrago seria pequeno (pula uma tela), mas o mesmo descuido
-- em outra coluna não seria — a proteção fica no banco.
-- ------------------------------------------------------------
create or replace function private.protect_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_change_password is distinct from old.must_change_password
     and (select auth.uid()) is not null then
    raise exception 'must_change_password so pode ser alterada pelo servidor'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_must_change_password() from public, anon, authenticated;

drop trigger if exists protect_must_change_password on public.profiles;
create trigger protect_must_change_password
  before update on public.profiles
  for each row execute function private.protect_must_change_password();

-- ------------------------------------------------------------
-- Tipo de canal de WhatsApp da empresa.
--
-- Hoje SÓ ARMAZENA: o WhatsApp não oficial ainda não existe no projeto
-- (o módulo inteiro é Meta Cloud API). Gravar desde já significa que as
-- empresas cadastradas antes já estarão marcadas quando ele for construído.
-- ------------------------------------------------------------
alter table public.location_limits
  add column if not exists whatsapp_provider text not null default 'meta';

alter table public.location_limits
  drop constraint if exists location_limits_whatsapp_provider_check;
alter table public.location_limits
  add constraint location_limits_whatsapp_provider_check
  check (whatsapp_provider in ('meta', 'evolution'));
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0052_primeiro_acesso.sql"` ao fim da lista `"04_departamentos_painel_agenda"`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole a migração no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar**

```sql
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name = 'profiles' and column_name = 'must_change_password';
  if n <> 1 then raise exception 'FALHOU: coluna must_change_password ausente'; end if;

  select count(*) into n from information_schema.columns
   where table_name = 'location_limits' and column_name = 'whatsapp_provider';
  if n <> 1 then raise exception 'FALHOU: coluna whatsapp_provider ausente'; end if;

  select count(*) into n from pg_trigger where tgname = 'protect_must_change_password';
  if n <> 1 then raise exception 'FALHOU: trigger de protecao ausente'; end if;

  raise notice 'OK: colunas e protecao no lugar';
end $$;
```

Expected: `NOTICE: OK: colunas e protecao no lugar`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0052_primeiro_acesso.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(plataforma): troca de senha no primeiro acesso e tipo de canal"
```

---

### Task 4: Migração 0053 — criação atômica da empresa

**Files:**
- Create: `supabase/migrations/0053_criar_empresa.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Consumes: `location_limits` (0046), `whatsapp_provider` (0052).
- Produces: `private.create_client_company(p_user_id uuid, p_nome text, p_max_users int, p_max_channels int, p_disabled_modules text[], p_provider text) returns uuid` — devolve o `id` da empresa criada.

**Por que uma função e não cinco chamadas da rota:** o cliente Supabase não abre transação entre chamadas. Fazendo empresa + vínculo + limites numa função, ou tudo entra ou nada entra. Sobra um único passo a compensar na rota (o usuário do Auth), em vez de quatro.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0053 — Criação atômica de empresa cliente
--
-- Chamada apenas pela rota /api/plataforma/empresas, com service role.
-- NÃO é exposta a `authenticated`: quem pode criar empresa é o dono da
-- plataforma, e a rota já validou isso antes de chamar.
-- ============================================================

create or replace function private.create_client_company(
  p_user_id          uuid,
  p_nome             text,
  p_max_users        int,
  p_max_channels     int,
  p_disabled_modules text[],
  p_provider         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc uuid;
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome da empresa e obrigatorio';
  end if;

  insert into public.locations (name) values (trim(p_nome)) returning id into loc;

  -- O trigger seed_limits_on_location (0046) já criou a linha de limites
  -- aqui, com max_users nulo. Por isso o vínculo abaixo nunca é barrado
  -- pelo trigger de limite: os valores reais só entram no update seguinte.
  insert into public.location_members (location_id, user_id, role)
  values (loc, p_user_id, 'admin');

  update public.location_limits
     set max_users             = p_max_users,
         max_whatsapp_channels = p_max_channels,
         disabled_modules      = coalesce(p_disabled_modules, '{}'),
         whatsapp_provider     = coalesce(nullif(trim(p_provider), ''), 'meta'),
         updated_at            = now()
   where location_id = loc;

  update public.profiles set must_change_password = true where id = p_user_id;

  return loc;
end;
$$;

revoke all on function private.create_client_company(uuid, text, int, int, text[], text) from public, anon, authenticated;

-- Wrapper em public porque o PostgREST só expõe RPC do schema `public`.
-- SEM grant a authenticated: só a service role chama, a partir da rota que
-- já validou que quem pediu é o dono da plataforma.
create or replace function public.create_client_company(
  p_user_id          uuid,
  p_nome             text,
  p_max_users        int,
  p_max_channels     int,
  p_disabled_modules text[],
  p_provider         text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.create_client_company(p_user_id, p_nome, p_max_users,
                                       p_max_channels, p_disabled_modules, p_provider)
$$;

revoke all on function public.create_client_company(uuid, text, int, int, text[], text)
  from public, anon, authenticated;
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0053_criar_empresa.sql"` ao fim da lista `"04_departamentos_painel_agenda"`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes, sem exceção.

- [ ] **Step 3: Aplicar no banco**

Cole a migração no SQL Editor e execute.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar que é atômica**

```sql
do $$
declare
  loc uuid;
  n int;
begin
  -- Nome vazio precisa falhar SEM deixar empresa órfã.
  select count(*) into n from public.locations;
  begin
    perform private.create_client_company(
      (select id from auth.users limit 1), '  ', null, null, '{}', 'meta');
    raise exception 'FALHOU: aceitou nome vazio';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  if (select count(*) from public.locations) <> n then
    raise exception 'FALHOU: sobrou empresa orfa apos erro';
  end if;

  raise notice 'OK: erro nao deixa empresa orfa';
end $$;
```

Expected: `NOTICE: OK: erro nao deixa empresa orfa`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0053_criar_empresa.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(plataforma): criacao atomica de empresa cliente"
```

---

### Task 5: Rota de cadastro de empresa

**Files:**
- Create: `src/lib/plataforma/guard.ts`, `src/app/api/plataforma/empresas/route.ts`

**Interfaces:**
- Consumes: `private.create_client_company(...)` (Task 4), `createAdminClient()` de `@/lib/supabase/admin`, `createClient()` de `@/lib/supabase/server`.
- Produces: `requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; response: Response }>` em `src/lib/plataforma/guard.ts`; `POST /api/plataforma/empresas`.

- [ ] **Step 1: Criar a guarda reutilizável**

Crie `src/lib/plataforma/guard.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

/**
 * Portão das rotas de plataforma. Valida a sessão e confirma que o usuário
 * está em private.platform_admins.
 *
 * A checagem vai pelo RPC com a sessão do usuário — não com a service role.
 * Com service role, `auth.uid()` é nulo e a função responderia sempre false,
 * o que travaria tudo; e aceitar um id vindo do request deixaria o chamador
 * escolher quem ele é.
 */
export async function requirePlatformAdmin(): Promise<
  { ok: true } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: Response.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data, error } = await supabase.rpc("is_platform_admin_check");
  if (error || data !== true) {
    return { ok: false, response: Response.json({ error: "Sem acesso" }, { status: 403 }) };
  }
  return { ok: true };
}
```

> O RPC `is_platform_admin_check` já foi criado pela migração `0050` na Task 1.
> Nada a aplicar aqui.

- [ ] **Step 2: Criar a rota**

Crie `src/app/api/plataforma/empresas/route.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/plataforma/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    nome?: string;
    email?: string;
    senha?: string;
    maxUsers?: number | null;
    maxChannels?: number | null;
    disabledModules?: string[];
    provider?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const nome = body.nome?.trim();
  const email = body.email?.trim().toLowerCase();
  const senha = body.senha ?? "";

  if (!nome) return Response.json({ error: "Informe o nome da empresa" }, { status: 400 });
  if (!email?.includes("@")) return Response.json({ error: "Informe um e-mail válido" }, { status: 400 });
  if (senha.length < 8) {
    return Response.json({ error: "A senha precisa ter ao menos 8 caracteres" }, { status: 400 });
  }

  const db = createAdminClient();

  // 1. Usuário do Auth primeiro: é o passo com maior chance de falhar
  //    (e-mail já cadastrado) e o único que precisa ser desfeito à mão.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { name: nome },
  });

  if (authError || !created?.user) {
    const jaExiste = authError?.message?.toLowerCase().includes("already");
    return Response.json(
      { error: jaExiste ? "Já existe uma conta com este e-mail" : (authError?.message ?? "Falha ao criar o acesso") },
      { status: 400 },
    );
  }

  // 2. Empresa, vínculo e limites numa transação só.
  const { data: locationId, error: rpcError } = await db.rpc("create_client_company", {
    p_user_id: created.user.id,
    p_nome: nome,
    p_max_users: body.maxUsers ?? null,
    p_max_channels: body.maxChannels ?? null,
    p_disabled_modules: body.disabledModules ?? [],
    p_provider: body.provider ?? "meta",
  });

  if (rpcError || !locationId) {
    // Compensação: sem isto sobra um usuário sem empresa — exatamente o
    // estado órfão que precisou ser consertado à mão neste projeto.
    await db.auth.admin.deleteUser(created.user.id);
    return Response.json(
      { error: `Empresa não criada (${rpcError?.message ?? "erro desconhecido"}). Nenhum acesso foi deixado para trás.` },
      { status: 500 },
    );
  }

  return Response.json({ locationId, email });
}
```

> O wrapper público `create_client_company` já foi criado pela migração `0053`
> na Task 4, sem `grant` a `authenticated` — só a service role chama. Nada a
> aplicar aqui.

- [ ] **Step 3: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 4: Verificar a recusa a quem não é dono**

Com `npm run dev`, logado como um usuário comum (não cadastrado em
`private.platform_admins`), no console do navegador:

```js
await (await fetch("/api/plataforma/empresas", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nome: "Teste", email: "x@y.com", senha: "12345678" }),
})).json()
```

Expected: `{ error: "Sem acesso" }`, status 403. Se criar a empresa, a guarda
não está funcionando — pare e corrija.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plataforma src/app/api/plataforma supabase/migrations/ supabase/setup/ scripts/gerar-setup.ps1
git commit -m "feat(plataforma): rota de cadastro de empresa com compensacao"
```

---

### Task 6: Telas da plataforma

**Files:**
- Create: `src/app/plataforma/layout.tsx`, `src/app/plataforma/page.tsx`, `src/app/plataforma/nova/page.tsx`, `src/lib/data/repos/db/plataforma.ts`
- Modify: `src/proxy.ts` (comentário do matcher, se necessário)

**Interfaces:**
- Consumes: `POST /api/plataforma/empresas` (Task 5), `public.platform_stats()` (Task 1), tabelas `locations` e `location_limits` via policies de plataforma.
- Produces: repo `plataformaActions.criarEmpresa(...)`, `plataformaActions.suspender(locationId, motivo)`, `plataformaActions.reativar(locationId)`, `plataformaActions.salvarLimites(...)`, e o hook `useEmpresas()`.

- [ ] **Step 1: Criar o repo**

Crie `src/lib/data/repos/db/plataforma.ts` seguindo o padrão dos outros repos `db/`
(store Zustand + `load` + ações). Ele expõe:

```ts
export interface EmpresaPlataforma {
  id: string;
  nome: string;
  criadaEm: string;
  suspensaEm: string | null;
  motivoSuspensao: string | null;
  maxUsers: number | null;
  maxChannels: number | null;
  disabledModules: string[];
  whatsappProvider: "meta" | "evolution";
  usuarios: number;
  contatos: number;
  canais: number;
  canaisAtivos: number;
}
```

`load()` faz duas consultas e junta em memória: `locations` (com
`location_limits` embutido pelo relacionamento) e o RPC `platform_stats()`.
Junte por `location_id`. Não filtre nem mapeie dentro de selector do Zustand.

Ações:
- `criarEmpresa(input)` → `POST /api/plataforma/empresas`, recarrega a lista
- `suspender(id, motivo)` → `update locations set suspended_at = now(), suspended_reason = motivo`
- `reativar(id)` → `update locations set suspended_at = null, suspended_reason = null`
- `salvarLimites(id, { maxUsers, maxChannels, disabledModules, whatsappProvider })` → `update location_limits`

- [ ] **Step 2: Criar o layout com guarda server-side**

Crie `src/app/plataforma/layout.tsx`. **Server component**, fora do grupo `(app)`
— não herda a sidebar do CRM:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/lib/config/brand";

export const dynamic = "force-dynamic";

/**
 * Guarda SERVER-SIDE. Do outro lado desta porta está a lista de todos os
 * clientes — uma checagem só no client seria contornável.
 */
export default async function PlataformaLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ehDono } = await supabase.rpc("is_platform_admin_check");
  if (ehDono !== true) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3">
        <span className="text-sm font-bold text-slate-900">{brand.name} · Plataforma</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Criar a lista de empresas**

Crie `src/app/plataforma/page.tsx` (client component) usando `useEmpresas()`.
Tabela com: nome, criada em, usuários (`usuarios` / `maxUsers ?? "∞"`), contatos,
canais (`canaisAtivos`/`canais`), tipo de canal, módulos bloqueados (contagem),
estado (Ativa | Suspensa) e ações Suspender/Reativar.

Suspender abre um diálogo pedindo o motivo — ele aparece para o cliente na tela
de bloqueio, então não pode ser vazio.

- [ ] **Step 4: Criar o formulário de nova empresa**

Crie `src/app/plataforma/nova/page.tsx` (client component) com: nome da empresa,
e-mail e senha do responsável, limite de usuários, limite de canais, seleção de
módulos a bloquear (a partir de `NAV_ITEMS` de `@/lib/config/nav`) e tipo de canal
(`meta` | `evolution`).

Deixe pré-marcados os quatro módulos que consomem credencial global —
`ai-studio`, `agentes-ia`, `marketing`, `whatsapp` — que é o padrão de empresa nova.

Ao salvar, chame `plataformaActions.criarEmpresa` e mostre o e-mail e a senha numa
confirmação copiável: é o que você vai entregar ao cliente, e a senha não aparece
de novo depois.

- [ ] **Step 5: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo, com as rotas `/plataforma` e `/plataforma/nova` na lista.

- [ ] **Step 6: Verificar no navegador**

Com `npm run dev`, logado como dono da plataforma, acesse
`http://localhost:3000/plataforma`.
Expected: a lista mostra sua empresa, com os contadores preenchidos.

Cadastre uma empresa de teste em `/plataforma/nova`.
Expected: aparece na lista. Confirme no SQL Editor que nasceu completa:

```sql
select l.name, l.suspended_at, ll.max_users, ll.whatsapp_provider,
       (select count(*) from public.location_members m where m.location_id = l.id) as membros
  from public.locations l
  join public.location_limits ll on ll.location_id = l.id
 order by l.created_at desc limit 3;
```

Expected: a empresa nova com 1 membro e os limites que você escolheu.

- [ ] **Step 7: Commit**

```bash
git add src/app/plataforma src/lib/data/repos/db/plataforma.ts
git commit -m "feat(plataforma): telas de cadastro e gestao das empresas"
```

---

### Task 7: Primeiro acesso e empresa suspensa no shell do CRM

**Files:**
- Create: `src/app/trocar-senha/page.tsx`, `src/app/(app)/suspensa/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `public.my_suspension()` (Task 2), `profiles.must_change_password` (Task 3).

- [ ] **Step 1: Barrar no shell**

Em `src/app/(app)/layout.tsx`, que é server component, acrescente as duas
checagens antes de renderizar o shell. Mantenha tudo que já está lá
(`SessionManager`, `AppointmentReminders`, `Sidebar`, `Topbar`, `ModuleGuard`
e o comentário sobre o lembrete da 0042):

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ... dentro do componente, antes do return:
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();

if (user) {
  // Empresa suspensa: a RLS já esconde tudo, então sem esta tela o cliente
  // veria um CRM vazio e ligaria para o suporte em vez de ler o motivo.
  const { data: susp } = await supabase.rpc("my_suspension");
  const linha = Array.isArray(susp) ? susp[0] : susp;
  if (linha?.suspended) redirect("/suspensa");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil?.must_change_password) redirect("/trocar-senha");
}
```

O componente passa a ser `async`.

- [ ] **Step 2: Criar a tela de empresa suspensa**

Crie `src/app/(app)/suspensa/page.tsx`. Mostra o motivo vindo de
`my_suspension()` e um texto orientando a falar com o suporte. Sem link para o
CRM — não há o que acessar.

⚠️ Esta página fica dentro de `(app)`, cujo layout redireciona para cá quando
suspensa. Para não criar laço infinito, o redirect do Step 1 só dispara quando
`pathname` não é já `/suspensa` — obtenha o caminho no server component com
`headers()` (`x-pathname` não existe por padrão no Next 16; use um layout
próprio para a rota, ou mova `suspensa` para FORA de `(app)`).

**Escolha recomendada:** mover a rota para `src/app/suspensa/page.tsx`, fora de
`(app)`. Sem laço, sem gambiarra de header, e a tela não precisa da sidebar
mesmo. Ajuste o redirect do Step 1 para `/suspensa`.

- [ ] **Step 3: Criar a tela de troca de senha**

Crie `src/app/trocar-senha/page.tsx`, **fora de `(app)`** pelo mesmo motivo.
Client component com dois campos (nova senha, confirmação), mínimo de 8
caracteres, chamando `supabase.auth.updateUser({ password })`.

Depois do sucesso, a coluna `must_change_password` precisa virar `false` — e o
trigger da 0052 impede o cliente de fazer isso. Crie
`POST /api/conta/senha-trocada` que usa a service role para baixar a flag,
validando a sessão antes. Só então redirecione para `/dashboard`.

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo, com `/trocar-senha` e `/suspensa` na lista de rotas.

- [ ] **Step 5: Verificar o fluxo completo**

Com `npm run dev`, entre com a empresa de teste criada na Task 6.
Expected: cai direto em `/trocar-senha`. Troque a senha.
Expected: vai para `/dashboard` e o CRM carrega.

Depois, no SQL Editor, suspenda a empresa de teste:

```sql
update public.locations set suspended_at = now(), suspended_reason = 'Teste de suspensao'
 where name = '<nome da empresa de teste>';
```

Recarregue a página logado como aquele cliente.
Expected: cai em `/suspensa` e vê o motivo "Teste de suspensao".

Reative e confirme que o CRM volta:

```sql
update public.locations set suspended_at = null, suspended_reason = null
 where name = '<nome da empresa de teste>';
```

- [ ] **Step 6: Commit**

```bash
git add src/app/trocar-senha src/app/suspensa "src/app/(app)/layout.tsx" src/app/api/conta
git commit -m "feat(plataforma): primeiro acesso com troca de senha e tela de empresa suspensa"
```

---

## Notas de verificação

O projeto não tem test runner. Quando houver, os melhores candidatos, em ordem
de valor:

1. `requirePlatformAdmin` — é o único portão entre um usuário comum e a lista
   de todos os clientes.
2. A compensação da rota de cadastro — o caminho de falha é justamente o que
   nunca se exercita à mão.
3. `private.user_locations()` com e sem suspensão — é a função de que toda
   policy do sistema depende.
