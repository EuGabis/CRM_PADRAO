# WhatsApp via Evolution API — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empresa com `whatsapp_provider = 'evolution'` conecta o número por QR code e passa a receber e enviar mensagens de texto pelo inbox que já existe.

**Architecture:** Um canal em `whatsapp_channels` passa a poder ser `meta` ou `evolution`. O caminho Evolution cria uma instância no gateway do dono, com webhook protegido por segredo próprio e envio autenticado pelo token da instância. O inbox não muda — ele já fala com uma abstração de canal.

**Tech Stack:** Evolution API v2.3.7 (header `apikey`, `integration: WHATSAPP-BAILEYS`), Next.js 16 App Router, TypeScript, Supabase, Zustand.

## Global Constraints

- **NUNCA tocar em instância que o CRM não criou.** O gateway hospeda uma instância `Teste` de OUTRO projeto do dono, com webhook apontado para outro sistema e recebendo mensagens de um número real. Toda operação de escrita valida antes que o canal existe no banco do CRM e que o nome bate com o padrão derivado do `channel_id`.
- **Próximo número de migração livre: `0057`.** Confira: `Get-ChildItem supabase/migrations -Name | Select-Object -Last 1`.
- Migração nova entra em `supabase/migrations/` **e** em `scripts/gerar-setup.ps1`, seguido de `powershell -NoProfile -File scripts/gerar-setup.ps1`.
- `api/whatsapp` **já está fora** do matcher em `src/proxy.ts:19` — o webhook novo nasce excluído, não mexa lá.
- Migrações idempotentes; funções em `private` com `security definer` e `set search_path = ''`, seguidas dos `revoke`/`grant`.
- Domínio de produção: `https://crm-padrao.vercel.app`.
- Texto de UI em pt-BR. Base UI, **não Radix**: triggers usam `render={<Button />}`, `SelectValue` com children explícito.
- Zustand: nunca filtrar/mapear/criar objeto dentro de selector. E **nunca marcar `loaded: true` quando `locationId` for nulo** — esse bug já apareceu 8 vezes neste projeto; ver `db/limits.ts` e `db/whatsapp.ts` para o padrão certo.
- Shell é PowerShell 5.1: `&&` não funciona, use `;`.
- Commits em português: `feat(whatsapp): descrição`.
- **Verificação:** o projeto não tem test runner (sem vitest/jest, sem `npm test`). Cada tarefa verifica com `npm run build`, asserção SQL em bloco `do $$`, e chamada real ao gateway quando aplicável. Não invente `npm test`.

---

### Task 1: Migração 0057 — o canal ganha provedor

**Files:**
- Create: `supabase/migrations/0057_canal_evolution.sql`
- Modify: `scripts/gerar-setup.ps1`

**Interfaces:**
- Produces: `whatsapp_channels.provider text not null default 'meta'`, `evolution_instance text unique`, `evolution_token text`, `webhook_secret text`, `connection_state text not null default 'disconnected'`, `disconnected_at timestamptz`. `phone_number_id` passa a aceitar nulo.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- 0057 — Canal de WhatsApp passa a ter provedor
--
-- whatsapp_channels foi moldada na Meta pela 0022: phone_number_id é
-- not null e unique, waba_id idem. Um canal conectado por QR code não tem
-- onde ser gravado.
--
-- A coerência vira `check` e não convenção: canal meta exige
-- phone_number_id, canal evolution exige evolution_instance. Sem isso, em
-- seis meses alguém grava um canal pela metade e o erro aparece longe da
-- causa.
-- ============================================================

alter table public.whatsapp_channels
  alter column phone_number_id drop not null,
  add column if not exists provider          text not null default 'meta',
  add column if not exists evolution_instance text,
  add column if not exists evolution_token    text,
  add column if not exists webhook_secret     text,
  add column if not exists connection_state   text not null default 'disconnected',
  add column if not exists disconnected_at    timestamptz;

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_provider_check;
alter table public.whatsapp_channels
  add constraint whatsapp_channels_provider_check
  check (provider in ('meta', 'evolution'));

create unique index if not exists whatsapp_channels_evolution_instance_key
  on public.whatsapp_channels (evolution_instance)
  where evolution_instance is not null;

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_coerencia_check;
alter table public.whatsapp_channels
  add constraint whatsapp_channels_coerencia_check
  check (
    (provider = 'meta'      and phone_number_id is not null) or
    (provider = 'evolution' and evolution_instance is not null)
  );

-- ------------------------------------------------------------
-- evolution_token e webhook_secret são SEGREDOS: com o token dá para enviar
-- mensagem em nome do cliente; com o segredo, injetar mensagem falsa na
-- conversa dele. O cliente vê o estado da conexão, nunca as credenciais.
--
-- Mesmo padrão do refresh_token da 0023. E como a 0055 concede select no
-- nível da tabela, o revoke de coluna precisa vir DEPOIS — grant de tabela
-- reconcede coluna revogada.
-- ------------------------------------------------------------
revoke select (evolution_token, webhook_secret)
  on public.whatsapp_channels from anon, authenticated;
```

- [ ] **Step 2: Registrar no gerador e regerar**

Acrescente `"0057_canal_evolution.sql"` ao fim da lista `"04_departamentos_painel_agenda"` em `scripts/gerar-setup.ps1`.

Run: `powershell -NoProfile -File scripts/gerar-setup.ps1`
Expected: 4 partes, sem exceção, parte 04 subindo em uma migração.

- [ ] **Step 3: Aplicar no banco**

Cole `supabase/migrations/0057_canal_evolution.sql` no SQL Editor.
Expected: `Success. No rows returned`.

- [ ] **Step 4: Verificar**

```sql
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name = 'whatsapp_channels'
     and column_name in ('provider','evolution_instance','evolution_token','webhook_secret','connection_state','disconnected_at');
  if n <> 6 then raise exception 'FALHOU: esperava 6 colunas novas, achei %', n; end if;

  select count(*) into n from information_schema.columns
   where table_name = 'whatsapp_channels' and column_name = 'phone_number_id' and is_nullable = 'YES';
  if n <> 1 then raise exception 'FALHOU: phone_number_id continua not null'; end if;

  -- canal evolution sem instancia tem que ser recusado
  begin
    insert into public.whatsapp_channels (location_id, name, provider, phone_number_id)
    values ((select id from public.locations limit 1), '__teste__', 'evolution', null);
    raise exception 'FALHOU: aceitou canal evolution sem evolution_instance';
  exception when check_violation then null;
  end;

  raise notice 'OK: schema do canal aceita os dois provedores';
end $$;
```

Expected: `NOTICE: OK: schema do canal aceita os dois provedores`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0057_canal_evolution.sql scripts/gerar-setup.ps1 supabase/setup/
git commit -m "feat(whatsapp): canal passa a ter provedor meta ou evolution"
```

---

### Task 2: Cliente da Evolution e confirmação das rotas de escrita

**Files:**
- Create: `src/lib/evolution/client.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `createInstance(nome: string, webhookUrl: string, webhookSecret: string): Promise<{ token: string }>`
  - `connectInstance(nome: string): Promise<{ qrBase64: string | null; state: string }>`
  - `connectionState(nome: string): Promise<string>` — devolve `"open" | "close" | "connecting"` etc.
  - `sendText(nome: string, token: string, paraE164: string, texto: string): Promise<{ id: string }>`
  - `deleteInstance(nome: string): Promise<void>` — usado só na compensação

⚠️ **As rotas de LEITURA foram confirmadas** por consulta real ao gateway v2.3.7:
`GET /instance/fetchInstances`, `GET /instance/connectionState/{nome}` (devolve
`{"instance":{"instanceName":"...","state":"open"}}`), `GET /webhook/find/{nome}`.
Autenticação por header `apikey`.

**As rotas de ESCRITA não foram exercitadas** de propósito — o gateway está em uso.
O Step 1 desta tarefa confirma o formato antes de qualquer código depender dele.

- [ ] **Step 1: Confirmar as rotas de escrita com uma instância descartável**

Isto é obrigatório e vem antes do código. A documentação pública estava fora do ar e a
v1 usava caminhos diferentes da v2.

Use o nome `crmon-probe-descartavel` — fora do padrão de produção, e impossível de
confundir com a instância `Teste` do outro projeto.

```bash
curl -s -X POST "$EVOLUTION_API_URL/instance/create" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"crmon-probe-descartavel","integration":"WHATSAPP-BAILEYS","qrcode":true}'
```

Anote no relatório: o caminho real, o corpo aceito, e **em que campo o QR vem** (procure
`qrcode.base64`, `base64` ou `qr`). Depois:

```bash
curl -s "$EVOLUTION_API_URL/instance/connect/crmon-probe-descartavel" -H "apikey: $EVOLUTION_API_KEY"
```

E o envio — **sem conectar número nenhum**, só para ver o formato do erro e confirmar o
caminho:

```bash
curl -s -X POST "$EVOLUTION_API_URL/message/sendText/crmon-probe-descartavel" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"number":"5511999999999","text":"probe"}'
```

**APAGUE a instância ao terminar**, sem exceção:

```bash
curl -s -X DELETE "$EVOLUTION_API_URL/instance/delete/crmon-probe-descartavel" -H "apikey: $EVOLUTION_API_KEY"
```

Confirme que sumiu:

```bash
curl -s "$EVOLUTION_API_URL/instance/fetchInstances" -H "apikey: $EVOLUTION_API_KEY"
```

Expected: só a instância `Teste`, que **não pode ter sido tocada**.

Se algum caminho divergir do que este plano assume, **use o real** e registre a
diferença no relatório.

- [ ] **Step 2: Escrever o cliente**

Crie `src/lib/evolution/client.ts`, no padrão de `src/lib/whatsapp/client.ts` (leia
antes). Ele lê `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` do ambiente e lança se
faltarem — as duas são obrigatórias no servidor e nunca vão ao navegador.

O envio usa o **token da instância**, não a chave global: assinatura
`sendText(nome, token, paraE164, texto)`, com o token no header `apikey` daquela
chamada. Vazamento do token afeta um cliente; da chave global, o gateway inteiro.

`deleteInstance` existe só para a compensação da Task 3. Ela **não** deve ser exportada
para uso geral nem chamada de nenhum outro lugar.

- [ ] **Step 3: Documentar as variáveis**

Em `.env.example`, acrescente uma seção:

```
# --- WhatsApp não oficial (Evolution API) ---
# Gateway próprio. A chave é global: com ela dá para criar, ler e apagar
# QUALQUER instância do gateway — inclusive de outros projetos que rodem nele.
EVOLUTION_API_URL="https://seu-gateway.exemplo"
EVOLUTION_API_KEY="<chave global do gateway>"
```

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evolution/client.ts .env.example
git commit -m "feat(whatsapp): cliente da Evolution API"
```

---

### Task 3: Conectar — criar instância e devolver o QR

**Files:**
- Create: `src/app/api/whatsapp/evolution/conectar/route.ts`

**Interfaces:**
- Consumes: o cliente da Task 2; colunas da Task 1.
- Produces: `POST /api/whatsapp/evolution/conectar` recebendo `{ channelId?: string, nome?: string }` e devolvendo `{ channelId, instancia, qrBase64, state }`.

- [ ] **Step 1: Escrever a rota**

Comportamento, na ordem:

1. Valida a sessão com `createClient()` de `@/lib/supabase/server` e resolve o
   `location_id` do usuário por `location_members`. **Nunca aceite `location_id` vindo
   do corpo** — o cliente escolheria a empresa.
2. Se veio `channelId`, carrega o canal e confirma que ele é da empresa do usuário e
   que `provider = 'evolution'`. É o caminho de **reconectar**.
3. Se não veio, cria o canal com `provider = 'evolution'`, `name` = o `nome` recebido.
   O trigger de limite da `0048` pode recusar aqui — repasse a mensagem
   `LIMITE_CANAIS` como está, ela já é legível.
4. Deriva `evolution_instance` do `channel_id`: `crmon-${channelId}`. **Nunca** use
   nome vindo do cliente — é o que garante que o CRM não colide com instância de outro
   projeto no mesmo gateway.
5. Gera `webhook_secret` aleatório (32+ caracteres).
6. Chama `createInstance(instancia, "https://crm-padrao.vercel.app/api/whatsapp/evolution/webhook", segredo)`,
   com os eventos `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
7. Grava `evolution_instance`, `evolution_token` e `webhook_secret` no canal.
8. Chama `connectInstance` e devolve o QR.

**Compensação obrigatória:** se o passo 7 ou 8 falhar depois de a instância existir no
gateway, chame `deleteInstance` e desfaça o canal criado no passo 3. Sem isso fica
instância órfã consumindo recurso do gateway sem canal correspondente — e ninguém
descobre até a conta chegar. Se o `deleteInstance` também falhar, **diga isso na
resposta** com o nome da instância; não afirme que nada ficou para trás.

No caminho de reconectar (passo 2), **não crie instância nova**: chame
`connectInstance` na que já existe.

- [ ] **Step 2: Verificar o build**

Run: `npm run build`
Expected: sem erro, com `/api/whatsapp/evolution/conectar` na lista de rotas.

- [ ] **Step 3: Verificar a recusa a quem não tem sessão**

Com `npm run dev`, numa aba anônima sem login:

```js
await (await fetch("http://localhost:3000/api/whatsapp/evolution/conectar", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nome: "Teste" }) })).json()
```

Expected: erro de autenticação, status 401. Se criar instância, pare e corrija.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/evolution/conectar
git commit -m "feat(whatsapp): rota de conexao por QR com compensacao"
```

---

### Task 4: Webhook — receber mensagem e queda de conexão

**Files:**
- Create: `src/app/api/whatsapp/evolution/webhook/route.ts`

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces: `POST /api/whatsapp/evolution/webhook`.

Leia `src/app/api/whatsapp/webhook/route.ts` antes: o webhook da Meta já faz
exatamente este trabalho (resolver canal → contato → conversa → gravar mensagem), e o
inbox depende do formato que ele grava.

- [ ] **Step 1: Escrever a rota**

1. **Valide o segredo do header** contra `webhook_secret` do canal, antes de qualquer
   coisa. Sem isso, quem descobrir a URL injeta mensagem falsa na conversa de qualquer
   cliente. Recuse com 401 e não vaze qual parte falhou.
2. Resolva o canal por `evolution_instance`. Canal desconhecido → responda 200 e
   ignore (pode ser instância de outro projeto no mesmo gateway; **não** trate como
   erro e **não** grave nada).
3. Evento `MESSAGES_UPSERT`: crie contato e conversa se não existirem e grave a
   mensagem, espelhando o webhook da Meta. Use o id da mensagem da Evolution em
   `wa_message_id` — a `0022` criou índice único parcial nessa coluna, e é ele que
   torna a reentrega idempotente. Trate a violação `23505` como "já processada":
   retorne sem erro, **sem** responder de novo.
4. Evento `CONNECTION_UPDATE`: atualize `connection_state` e, quando o estado sair de
   `open`, carimbe `disconnected_at`.
5. **Responda 200 mesmo em erro interno.** Webhook que responde erro faz o gateway
   reentregar em laço; registre com `console.error` e siga.

Use `createAdminClient()` — é chamada máquina-a-máquina, sem sessão.

- [ ] **Step 2: Verificar o build**

Run: `npm run build`
Expected: sem erro, com a rota na lista.

- [ ] **Step 3: Verificar que o segredo é exigido**

Com `npm run dev`:

```bash
curl -s -X POST http://localhost:3000/api/whatsapp/evolution/webhook -H "Content-Type: application/json" -d "{}"
```

Expected: 401. Se responder 200 e processar, a proteção não está no lugar.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/evolution/webhook
git commit -m "feat(whatsapp): webhook da Evolution com segredo por canal"
```

---

### Task 5: Enviar — bifurcar por provedor

**Files:**
- Modify: `src/app/api/whatsapp/send/route.ts`

**Interfaces:**
- Consumes: `sendText(nome, token, paraE164, texto)` da Task 2.

- [ ] **Step 1: Bifurcar**

Leia a rota inteira antes. Hoje ela: resolve o canal, checa `daily_limit` (linha ~73),
calcula a janela de 24h (linha ~77-86), e exige template fora dela (linha ~92-102).

A mudança:

- O `daily_limit` **continua valendo nos dois caminhos** — é regra do produto, não do
  provedor.
- A janela de 24h e o template **só se aplicam a `provider = 'meta'`**. No caminho
  `evolution` esses blocos precisam ser pulados: não existe janela nem template nesse
  provedor, e checá-los faria o envio falhar por uma regra da Meta.
- No caminho `evolution`, chame o `sendText` do cliente novo com o
  `evolution_token` do canal.
- Se `connection_state` não for `open`, recuse com mensagem clara pedindo para
  reconectar — melhor que falhar no gateway com erro cru.

Mantenha o comportamento do caminho `meta` **byte a byte**. Ele está em uso.

- [ ] **Step 2: Verificar o build**

Run: `npm run build`
Expected: sem erro de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/whatsapp/send/route.ts
git commit -m "feat(whatsapp): envio bifurcado por provedor"
```

---

### Task 6: Tela — QR, estado e aviso de queda

**Files:**
- Modify: `src/app/(app)/whatsapp/page.tsx`, `src/components/whatsapp/create-channel-dialog.tsx`, `src/lib/data/repos/db/whatsapp.ts`
- Create: `src/components/whatsapp/conectar-evolution.tsx`

**Interfaces:**
- Consumes: `POST /api/whatsapp/evolution/conectar` (Task 3), `connection_state` (Task 1).

- [ ] **Step 1: Bifurcar o diálogo de canal**

`create-channel-dialog.tsx` hoje pede `phone_number_id` e `waba_id`, que são da Meta.
Leia o `whatsapp_provider` da empresa (vem de `location_limits`, já disponível via
`db/limits.ts`) e mostre:

- `meta`: o formulário atual, intocado
- `evolution`: só o nome do canal, e um botão **Conectar** que abre o componente novo

- [ ] **Step 2: Criar o componente de conexão**

`conectar-evolution.tsx` chama a rota de conectar, mostra o QR como imagem a partir do
base64, e **busca de novo enquanto ninguém escaneia**. O QR expira em segundos; sem o
redesenho, a pessoa aponta a câmera para um código morto e conclui que o produto está
quebrado.

Pare de buscar quando o estado virar `open`, e mostre confirmação com o número que
conectou. Ponha um teto no número de tentativas — laço infinito de `useEffect` trava a
página.

- [ ] **Step 3: Mostrar o estado do canal na lista**

Em `whatsapp/page.tsx`, a lista de canais mostra `connection_state`: conectado,
desconectado (com desde quando) ou conectando. Canal desconectado ganha botão
**Reconectar**, que chama a mesma rota passando o `channelId` — reusa a instância, não
cria outra.

- [ ] **Step 4: Reconciliar ao abrir**

Ao carregar o módulo, para cada canal `evolution`, consulte o estado real e atualize se
divergir. Webhook se perde; sem essa rede, um canal pode ficar marcado como conectado
enquanto está fora do ar.

Faça isso no repo `db/whatsapp.ts`, sem criar cron. E **não** marque `loaded: true`
quando `locationId` for nulo — esse arquivo já tem o padrão certo, siga-o.

- [ ] **Step 5: Verificar o build**

Run: `npm run build`
Expected: sem erro, com `/whatsapp` na lista.

- [ ] **Step 6: Commit**

```bash
git add src/app/"(app)"/whatsapp src/components/whatsapp src/lib/data/repos/db/whatsapp.ts
git commit -m "feat(whatsapp): tela de conexao por QR e estado do canal"
```

---

### Task 7: Aviso de queda no shell e documentação

**Files:**
- Modify: `src/components/layout/notifications-panel.tsx`, `AGENTS.md`, `.env.example`

- [ ] **Step 1: Avisar fora do módulo**

O cliente pode passar dias sem abrir `/whatsapp` e sem perceber que parou de receber
mensagem. O sino de notificações (`notifications-panel.tsx`) já deriva avisos do banco
sem tabela própria — acrescente um: canal `evolution` com `connection_state` diferente
de `open` vira aviso com link para `/whatsapp`.

Leia o arquivo antes: ele monta os avisos por consulta própria, e o padrão de "lido"
é um conjunto de ids no `localStorage`.

- [ ] **Step 2: Documentar no AGENTS.md**

Na seção do WhatsApp, acrescente:

```markdown
### WhatsApp não oficial (Evolution)

`whatsapp_channels.provider` decide o caminho: `meta` (Cloud API) ou `evolution`
(gateway próprio, QR code). A coerência é imposta por `check` na `0057` — canal meta
exige `phone_number_id`, canal evolution exige `evolution_instance`.

**Nunca toque em instância que o CRM não criou.** O gateway hospeda instâncias de
outros projetos. O nome é sempre `crmon-{channel_id}`, derivado no servidor — nome
vindo do cliente jamais.

`evolution_token` e `webhook_secret` são segredos com `revoke` de coluna, no padrão do
`refresh_token` da `0023`. Como a `0055` concede `select` no nível da tabela, qualquer
`grant` novo reconcede essas colunas — reaplique o revoke.

Janela de 24h e template **não existem** na Evolution. Só valem no caminho `meta`.
```

- [ ] **Step 3: Atualizar o contador de migrações**

Em `AGENTS.md`, troque para `- **Próximo número livre: `0058`.**`

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/notifications-panel.tsx AGENTS.md .env.example
git commit -m "docs(whatsapp): aviso de queda e operacao da Evolution"
```

---

## Notas de verificação

O projeto não tem test runner. Quando houver, os melhores candidatos:

1. A validação do segredo do webhook — é a única barreira entre a internet e a
   conversa de um cliente.
2. A derivação do nome da instância — é o que garante que o CRM não escreve em
   instância de outro projeto.
3. A bifurcação por provedor no envio — um erro ali faz o caminho `meta`, que está em
   produção, quebrar.
