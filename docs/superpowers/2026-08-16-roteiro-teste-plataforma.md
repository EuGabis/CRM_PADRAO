# Roteiro de teste — painel de plataforma

Siga na ordem. **Use uma janela anônima separada para o cliente**: alternar entre a
conta do dono e a do cliente no mesmo navegador exige limpar cookie na mão.

Antes de começar, aplique as migrações `0053` e `0054` no SQL Editor, se ainda não
aplicou. As `0050`–`0052` já estão no banco.

---

## Passo 0 — Pré-voo

```sql
select 'prepare' as f, to_regprocedure('public.prepare_client_company(text,text,uuid,int,int,text[],text)') is not null as existe
union all select 'discard', to_regprocedure('public.discard_client_company(uuid)') is not null
union all select 'stats',   to_regprocedure('public.platform_stats()') is not null
union all select 'suspens', to_regprocedure('public.my_suspension()') is not null
union all select 'admchk',  to_regprocedure('public.is_platform_admin_check()') is not null;

select count(*) as sou_dono from private.platform_admins;
select has_function_privilege('service_role',
  'public.prepare_client_company(text,text,uuid,int,int,text[],text)','execute') as service_role_pode;
```

**Esperar:** cinco `true`, `sou_dono = 1`, `service_role_pode = true`.

Se `prepare`/`discard` vierem `false`, a `0053` não foi aplicada. Se
`service_role_pode` vier `false`:

```sql
grant execute on function
  public.prepare_client_company(text,text,uuid,int,int,text[],text),
  public.discard_client_company(uuid)
to service_role;
```

Confirme também que `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` começa com
`sb_secret_` — a chave JWT antiga é tratada como `anon` pelo PostgREST e faz o
cadastro falhar de um jeito confuso.

## Passo 1 — O CRM normal não regrediu

Entre com a sua conta. Navegue por Contatos, Leads e Conversas.

**Falha:** tela branca, redirect para `/login`, ou "sem empresa" → o `my_suspension`
do shell quebrou; procure `[AppLayout]` no terminal do `npm run dev`.

## Passo 2 — O painel abre

Digite `/plataforma` na barra de endereço (não há link na sidebar, é de propósito).

**Esperar:** tabela com a sua empresa, contadores preenchidos.

**Falhas:**
- Voltou para `/dashboard` → `0050` não aplicada, ou você não está em
  `private.platform_admins`.
- Caixa vermelha "Não foi possível carregar" → leia a mensagem;
  `permission denied for function platform_stats` é grant faltando.
- **Todas** com "∞", "Nenhum" e "Meta" → o embed de `location_limits` voltou array.
  Compare com `select * from public.location_limits;`.

## Passo 3 — Criar a primeira empresa cliente

`/plataforma/nova`. Nome "Empresa Teste 1", um e-mail que **não existe** no Auth
(use `seuemail+teste1@…`), senha de 12 caracteres, **limite de usuários 2**, canais 1,
tipo Meta, os 4 módulos padrão bloqueados.

Antes de salvar: clique no **texto** de um módulo (não no quadradinho) e confirme que
alterna uma vez só; abra o seletor de tipo de canal.

**Esperar:** diálogo com e-mail e senha, botão copiar funcionando, e a empresa na
lista com `1 / 2` usuários e 4 módulos bloqueados.

**Falhas:**
- `Could not find the function public.prepare_client_company` → `0053` não aplicada.
- `column reference "email" is ambiguous` → foi aplicada uma versão antiga da `0053`;
  reaplique o arquivo atual.
- Toast amarelo sobre troca de senha → anote, o passo 5 vai falhar.

Confirme no SQL:

```sql
select l.name, ll.max_users, ll.disabled_modules,
       (select count(*) from public.location_members m where m.location_id = l.id) as membros,
       (select count(*) from public.pipelines p where p.location_id = l.id)        as funis,
       (select status from public.invitations i where i.location_id = l.id limit 1) as convite,
       (select p.must_change_password from public.profiles p
          join public.location_members m2 on m2.user_id = p.id and m2.location_id = l.id limit 1) as troca_senha
  from public.locations l join public.location_limits ll on ll.location_id = l.id
 where l.name = 'Empresa Teste 1';
```

**Esperar:** `membros = 1`, `funis = 1`, `convite = accepted`, `troca_senha = true`.
Se `funis = 0`, o cliente vai abrir Leads sem funil nenhum.

## Passo 4 — Primeiro acesso (janela anônima)

Entre com as credenciais entregues.

**Esperar:** redirect automático para `/trocar-senha`.
**Falha:** caiu no `/dashboard` → a flag não foi gravada ou a leitura no shell falhou.

## Passo 5 — A trava da senha realmente trava

Digite a **mesma senha provisória** nos dois campos.

**Esperar:** erro pedindo senha diferente, permanecendo na tela.
**Falha grave:** se aceitar e entrar, a troca obrigatória virou decoração — você
continuaria sabendo a senha do cliente.

## Passo 6 — Trocar de verdade

Senha nova, 8+ caracteres.

**Esperar:** sucesso e ida para `/dashboard`.
**Falha:** voltou para `/trocar-senha` → dê F5. Se com F5 entrar, é cache de router.
Se nem com F5, veja `/api/conta/senha-trocada` no Network.

Feche a janela anônima, abra outra e entre com a **senha nova**. Tem que funcionar.

## Passo 7 — O CRM do cliente está inteiro

- **Leads** → funil "✅ Controle de Leads" com 9 etapas
- **WhatsApp, Marketing, AI Studio, Agentes de IA** → bloqueados pelo plano
- **Contatos, Conversas, Agenda** → abrem vazios, sem erro

## Passo 8 — O limite de usuários morde

Como cliente: Equipe → convidar 1 pessoa (ok, 1 membro + 1 pendente = 2). Convidar a
2ª → erro contendo `LIMITE_USUARIOS`.

## Passo 9 — O cliente não se promove

Como cliente, no Console do DevTools:

```js
const url = "<NEXT_PUBLIC_SUPABASE_URL>", key = "<NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>";
const tok = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes("auth-token"))[1]).access_token;
const h = { apikey: key, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

console.log(await (await fetch(`${url}/rest/v1/profiles?id=eq.${JSON.parse(atob(tok.split(".")[1])).sub}`,
  { method: "PATCH", headers: h, body: '{"must_change_password":true}' })).text());
console.log((await fetch(`${url}/rest/v1/platform_admins`, { headers: h })).status);
```

**Esperar:** o primeiro devolve `insufficient_privilege`; o segundo, 404 ou 401.
Deixe esse console aberto, o passo 11 usa de novo.

## Passo 10 — Suspender

Na janela do dono: `/plataforma` → Suspender "Empresa Teste 1", motivo
"Pagamento em atraso — teste".

## Passo 11 — A suspensão bloqueia

Na janela do cliente, F5.

**Esperar:** tela "Acesso suspenso" com exatamente o motivo digitado.
**Falha:** CRM vazio ou "sem empresa" em vez da tela → a ordem das checagens no shell
quebrou.

No console do cliente:

```js
for (const t of ["contacts","conversations","messages","opportunities","location_limits"])
  console.log(t, await (await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers: h })).json());

console.log(await (await fetch(`${url}/rest/v1/locations?id=eq.<LOCATION_ID>`,
  { method: "PATCH", headers: { ...h, Prefer: "return=representation" }, body: '{"suspended_at":null}' })).text());
```

**Esperar:** os cinco voltam `[]`. O PATCH volta `[]` (zero linhas afetadas).
**Falha crítica:** se o PATCH devolver a linha alterada, a `0051` não foi aplicada —
pare e aplique.

## Passo 12 — O isolamento do dono

Na janela do **dono**, em `/plataforma`, o mesmo bloco com o token dele:

```js
for (const t of ["contacts","conversations","messages","opportunities"])
  console.log(t, await (await fetch(`${url}/rest/v1/${t}?select=id&limit=5`, { headers: h })).json());
```

**Esperar:** só registros da sua própria empresa.
**Falha crítica:** qualquer linha do cliente aparecendo significa que uma policy nova
encostou nessas tabelas — não deveria haver nenhuma.

## Passo 13 — Editar o plano e reativar

`/plataforma` → clique na empresa → altere o limite de usuários para 5 e libere o
módulo WhatsApp → salvar. Volte e reative.

Na janela do cliente, F5: o CRM volta, o funil continua lá, o convite do passo 8
continua pendente, e o WhatsApp aparece na sidebar.

## Passo 14 — Limpar

```sql
delete from public.locations where name = 'Empresa Teste 1';
```

Depois apague o usuário de teste em Authentication → Users. Confirme que
`/plataforma` voltou a listar só a sua empresa.

---

## Detalhe tranquilizador

`/plataforma` fica **fora** do grupo `(app)`, então não passa pelo portão de
suspensão. Se você suspender a própria empresa por engano, continua conseguindo
entrar no painel para reativar. Não há como se trancar do lado de fora.

## Dívidas conhecidas

- **Automações:** o filtro de suspensão busca 3× o lote e corta depois. Se uma
  empresa suspensa acumular mais de 75 runs vencidos, o bloqueio de fila volta. Ela
  continua enfileirando porque os gatilhos vêm de endpoints públicos (formulários,
  webhooks) que a suspensão não fecha. Trocar por filtro no banco quando houver
  cliente com formulário público de tráfego alto.
- **Marketing:** o `update` da promoção `scheduled → sending` perdeu o
  `.eq("status","scheduled")`. Entre o `select` e o `update`, uma campanha movida
  para `paused` por outro tick poderia ser ressuscitada. Correção de uma linha.
