# WhatsApp não oficial via Evolution API

**Data:** 2026-08-17
**Status:** aprovado, pronto para plano de implementação

## Objetivo

Empresa com `whatsapp_provider = 'evolution'` conecta o número por QR code e passa a
receber e enviar mensagens de texto pelo inbox que já existe — sem formulário da Meta.

## Escopo da v1

**Entra:** conectar por QR, receber texto, enviar texto, e avisar dentro do CRM quando
a conexão cair.

**Não entra:** mídia, áudio, auto-resposta com IA, mensagens agendadas. Ficam para uma
segunda leva, sobre uma base já validada com cliente real.

A janela de 24h e os templates aprovados **não existem** neste provedor. Não devem ser
checados no caminho `evolution` — se ficarem, o envio falha por uma regra da Meta que
não se aplica.

## Restrição inegociável: não tocar no que já existe

O gateway (`expensiveportuguesemanowar-evolution.cloudfy.live`, v2.3.7) já hospeda uma
instância chamada `Teste`, em uso por **outro projeto** do dono, com webhook apontado
para um sistema diferente e recebendo mensagens de um número real.

O CRM **cria instâncias novas e nada mais**. Nunca lê, altera, reconfigura ou apaga
instância que não tenha criado. Reaproveitar a `Teste` roubaria as mensagens do outro
sistema.

A garantia é estrutural, não disciplinar: o nome da instância é derivado do
`channel_id` gerado pelo CRM, então colisão com nome escolhido por humano é
impossível. Toda operação de escrita na Evolution valida antes que o canal existe no
banco do CRM e que o nome bate com o padrão.

## O que foi verificado na v2.3.7 (consulta real ao gateway)

| Endpoint | Método | Resposta confirmada |
|---|---|---|
| `/instance/fetchInstances` | GET | lista com `name`, `connectionStatus`, `ownerJid`, `number`, `integration`, `token` |
| `/instance/connectionState/{nome}` | GET | `{"instance":{"instanceName":"...","state":"open"}}` |
| `/webhook/find/{nome}` | GET | `{"url","headers","enabled","events","webhookByEvents","webhookBase64"}` |

Autenticação por header `apikey`. O modo QR é `integration: "WHATSAPP-BAILEYS"`.

⚠️ As rotas de **escrita** (`/instance/create`, `/instance/connect/{nome}`,
`/message/sendText/{nome}`) não foram exercitadas, para não criar nada no gateway em
uso. O plano de implementação precisa confirmá-las contra a v2.3.7 antes de assumir
formato de corpo — a documentação pública estava fora do ar e a v1 usava caminhos
diferentes.

## Dois achados que mudaram o desenho

**O webhook aceita header customizado.** Descoberto ao inspecionar o webhook da
instância existente. Sem isso, a rota do CRM ficaria aberta: quem descobrisse a URL
injetaria mensagem falsa na conversa de qualquer cliente. Cada canal ganha um segredo
próprio, enviado pela Evolution no header e conferido pela rota.

**Cada instância tem `token` próprio**, separado da chave global. O envio usa o token
do canal, não a chave do gateway — vazamento afeta um cliente, não todos.

## Modelo de dados

Migração nova sobre `public.whatsapp_channels`, que hoje é moldada na Meta
(`phone_number_id` e `waba_id` são `not null`, e o primeiro é `unique`):

```sql
alter table public.whatsapp_channels
  alter column phone_number_id drop not null,
  add column if not exists evolution_instance text unique,
  add column if not exists evolution_token   text,
  add column if not exists webhook_secret    text,
  add column if not exists connection_state  text not null default 'disconnected',
  add column if not exists disconnected_at   timestamptz;
```

E a coerência é imposta por `check`, não por convenção:

- canal com `provider = 'meta'` exige `phone_number_id`
- canal com `provider = 'evolution'` exige `evolution_instance`

Sem isso, em seis meses alguém grava um canal pela metade e o erro aparece longe da
causa. `whatsapp_channels` ganha a coluna `provider`, com o mesmo domínio de
`location_limits.whatsapp_provider`.

`evolution_token` e `webhook_secret` são segredos: coluna revogada de `authenticated`,
no mesmo padrão do `refresh_token` da `0023`. O cliente vê o estado da conexão, nunca
as credenciais.

**Uma instância por canal**, não por empresa. Cai naturalmente no modelo existente: a
empresa já pode ter vários números, e `location_limits.max_whatsapp_channels` já
governa quantos — o trigger da `0048` continua valendo sem alteração.

## Fluxo de conexão

O cliente abre `/whatsapp` e clica em **Conectar**. Rota server-side (a chave global
nunca vai ao navegador):

1. Cria o canal no banco, obtendo o `channel_id`
2. Gera `evolution_instance` derivado do `channel_id` e um `webhook_secret` aleatório
3. Cria a instância na Evolution com `integration: "WHATSAPP-BAILEYS"`, webhook
   apontando para `https://crm-padrao.vercel.app/api/whatsapp/evolution/webhook`, o
   segredo no header, e os eventos `MESSAGES_UPSERT` e `CONNECTION_UPDATE`
4. Guarda o `token` devolvido pela Evolution
5. Devolve o QR para a tela

**O QR expira em segundos.** A tela precisa buscá-lo de novo enquanto ninguém escaneia,
senão a pessoa aponta a câmera para um código morto e conclui que o produto está
quebrado. O redesenho é por chamada à rota de conexão, não por WebSocket — menos peça
para manter.

Quando a pessoa escaneia, a Evolution emite `CONNECTION_UPDATE`; o canal vira
`connected` e grava o número real que conectou (`ownerJid` / `number`).

**Se qualquer passo falhar depois de a instância ser criada na Evolution, ela precisa
ser removida** — senão fica órfã no gateway, cobrando recurso e sem canal
correspondente no CRM. É a mesma compensação do cadastro de empresa, e pela mesma
razão.

## Receber

`POST /api/whatsapp/evolution/webhook`, **fora do matcher do `proxy.ts`** (chamada
máquina-a-máquina, sem sessão) e validando o segredo do próprio header.

Resolve o canal por `evolution_instance`, e daí a empresa. Cria contato e conversa se
não existirem, grava a mensagem. É o que o webhook da Meta já faz — o inbox não muda,
porque já fala com uma abstração de canal.

Idempotência pelo id da mensagem, como a `0022` fez com `wa_message_id`: webhook
reentrega, e sem isso a conversa duplica.

`CONNECTION_UPDATE` atualiza `connection_state` e carimba `disconnected_at`.

## Enviar

A rota de envio existente bifurca pelo `provider` do canal. O caminho `meta` segue
intocado. O caminho `evolution` chama `/message/sendText/{instancia}` com o token do
canal, e **não** avalia janela de 24h nem template.

O limite diário do canal (`daily_limit`) continua valendo nos dois caminhos — é regra
do produto, não do provedor.

## Queda de conexão

Sessão de WhatsApp não oficial cai por rotina: celular sem bateria, logout pelo
aparelho, inatividade. A instância existente no gateway registra um
`disconnectionReasonCode: 401` de julho, o que confirma que acontece.

Duas fontes, porque webhook se perde:

1. `CONNECTION_UPDATE` chega e atualiza o estado — caminho normal
2. Ao abrir o módulo de WhatsApp, o CRM consulta
   `/instance/connectionState/{instancia}` e reconcilia — rede de segurança

O aviso aparece **no shell**, não só na tela de WhatsApp: o cliente pode passar dias
sem abrir aquele módulo e sem perceber que parou de receber mensagem. Botão de
reconectar traz o QR de novo, reusando a instância existente.

Nenhum cron novo. A reconciliação é sob demanda.

## O módulo deixa de nascer bloqueado

A `0046` fazia empresa nova nascer com `whatsapp` bloqueado, junto de `ai-studio`,
`agentes-ia` e `marketing` — todos por consumirem credencial global do dono.

O WhatsApp saiu dessa categoria com a Evolution: o custo passa a ser o gateway
próprio, que é **fixo**. Um cliente a mais conectando usa capacidade já paga. Manter
bloqueado seria atrito sem economia. Migração `0056`.

⚠️ O módulo cobre os **dois** provedores. Empresa com `whatsapp_provider = 'meta'` e
o módulo liberado volta a consumir `WHATSAPP_TOKEN`, que é medido. Se isso incomodar,
o caminho é separar o gate por provedor — não voltar a bloquear o módulo inteiro.

Empresas existentes não são tocadas: cada uma já teve os módulos ajustados à mão no
painel, e reescrever desfaria essa configuração em silêncio.

## Fora de escopo

Mídia, áudio e documento; auto-resposta com IA; mensagens agendadas pelo caminho
Evolution; migrar canal de `meta` para `evolution` ou o contrário; múltiplos gateways;
gateway próprio por cliente.

## Riscos aceitos

- **O gateway é único e do dono da plataforma.** Se ele cair, todos os clientes com
  canal Evolution param juntos. Não há redundância nesta versão.
- **Não oficial fere os termos do WhatsApp**; o número do cliente pode ser banido. É
  decisão de negócio já tomada, registrada aqui para não se perder.
- **A chave global da Evolution vive no servidor do CRM.** Com ela é possível criar,
  ler e apagar qualquer instância do gateway — inclusive a do outro projeto. Por isso
  a restrição de nunca escrever fora do padrão de nome é parte do desenho, não zelo.
