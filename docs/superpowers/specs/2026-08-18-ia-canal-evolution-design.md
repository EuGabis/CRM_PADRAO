# IA no canal Evolution, e os caminhos que ainda são Meta-only — design

**Data:** 2026-08-18

**Objetivo:** a auto-resposta com IA passa a funcionar no canal WhatsApp não
oficial (Evolution), entende áudio e foto recebidos, e os dois últimos caminhos
presos à Meta (mensagens agendadas e templates) passam a respeitar o provedor.

## O problema hoje

Três defeitos independentes, todos silenciosos:

1. **A IA não existe no canal Evolution.** `maybeAutoReply` é chamado de um
   único lugar — o webhook da Meta (`api/whatsapp/webhook/route.ts:238`). O
   webhook da Evolution nunca chama. O cliente escreve, a IA nunca responde, e
   nada indica que deveria ter respondido.
2. **Mesmo se chamasse, o envio quebraria.** `auto-reply.ts:113` envia por
   `sendText(p.phoneNumberId, …)`, da Cloud API. Em canal Evolution o
   `phone_number_id` é NULO — garantido pelo `check` da `0057`.
3. **Mensagens agendadas aplicam a janela de 24h da Meta a todo canal**
   (`lib/messages/scheduled.ts:177`). Em canal Evolution, onde essa janela não
   existe, todo agendamento é recusado com "janela de 24h fechada — reenvie por
   template": um erro sobre uma regra que não se aplica.

O miolo da auto-resposta **já é agnóstico de provedor** e não muda: guarda de
plano, empresa suspensa, `bot_paused` (humano assumiu), agente principal ativo,
limite diário do canal, e as últimas 10 mensagens como contexto.

## Arquitetura

### 1. Um helper de envio, não três bifurcações

Três lugares mandam texto no WhatsApp: a rota interativa (já bifurcada), a
auto-resposta e as mensagens agendadas. Bifurcar cada um separadamente
produziria três cópias da mesma decisão.

Cria-se **um helper** em `src/lib/whatsapp/enviar.ts`:

```
enviarTexto(db, channelId, paraE164, texto)
  -> { ok: true, waMessageId: string | null } | { ok: false, motivo: string }
```

Ele resolve o canal, lê o provedor e escolhe o caminho: `meta` usa a Cloud API
como hoje; `evolution` exige `connection_state = 'open'`, busca
`evolution_instance`/`evolution_token` (colunas secretas, só service role desde a
`0058`) e chama o cliente da Evolution.

O helper **não** aplica limite diário nem janela de 24h — essas regras pertencem
a quem chama, porque cada chamador as aplica em momento diferente. O helper faz
uma coisa: entregar o texto pelo provedor certo.

A auto-resposta e as agendadas passam a usá-lo. A rota interativa **não é
tocada**: está em produção e já foi revisada duas vezes.

### 2. Auto-resposta no canal Evolution

O webhook da Evolution passa a chamar `maybeAutoReply` depois de gravar uma
mensagem de entrada, no mesmo ponto em que o webhook da Meta chama.

`maybeAutoReply` troca o parâmetro `phoneNumberId` por `channelId` (que já
recebe) e passa a enviar pelo helper. Nenhuma das regras existentes muda.

**Ordem das guardas não pode mudar:** chave da OpenAI presente → módulo
habilitado no plano → empresa não suspensa → `bot_paused` falso → agente
principal ativo → limite diário. Só depois disso é que se gasta qualquer
credencial global.

### 3. Áudio recebido vira texto

Quando a mensagem de entrada for `audio` **e todas as guardas acima passarem**,
o CRM baixa o arquivo do bucket `conversation-media` (service role), manda ao
Whisper e usa o texto transcrito como se o cliente tivesse escrito.

A ordem importa e é decisão de custo: transcrever **depois** das guardas
significa nunca gastar transcrição com empresa suspensa, com módulo bloqueado,
com o bot pausado ou com limite estourado.

A transcrição é gravada na própria mensagem, em coluna nova
`messages.media_transcript`. Dois motivos: o atendente lê o que foi dito sem
precisar ouvir, e uma reentrega do mesmo evento não paga transcrição de novo.

**Teto:** áudio acima de 5 minutos (campo `seconds` do payload) ou acima de
20 MB não é transcrito — responde como mídia não interpretada. Sem teto, um
áudio longo de um cliente vira custo aberto na conta do dono da plataforma.

### 4. Foto recebida é interpretada, com trava

Imagem de entrada é enviada ao modelo junto da conversa, por URL assinada de
curta duração do bucket (o modelo busca o arquivo; nenhum byte passa pela nossa
função).

**A trava é a parte que não pode falhar.** O prompt do sistema ganha uma
instrução final, acrescentada **depois** do texto do agente para que vença
qualquer personalidade configurada pelo cliente:

> Você NUNCA confirma pagamento, valor, comprovante, documento ou identidade a
> partir de uma imagem. Se a imagem parecer comprovante, boleto, nota, documento
> ou algo que peça confirmação de valor, responda que um atendente humano vai
> conferir e não afirme nada sobre o conteúdo.

Sem isso o caso clássico acontece: o cliente manda um comprovante de PIX e a IA
responde "pagamento confirmado", tendo apenas lido uma imagem, sem consultar
nada. O erro é caro para o cliente e volta para o dono da plataforma.

Vídeo e documento **não** são interpretados: nenhum modelo de chat aceita vídeo,
e PDF exigiria extração de texto, que é outro trabalho. Nesses casos a IA
responde reconhecendo o recebimento e **não** pausa o bot — pausar deixaria a
conversa muda para sempre depois de um único anexo.

### 5. O cliente da OpenAI aceita imagem

`src/lib/ai/openai.ts` hoje só aceita `content` string. Passa a aceitar também a
forma com partes (texto + imagem) da API de chat. **Os chamadores atuais
(AI Studio, `api/ai/generate`) não mudam** — a forma string continua válida.

### 6. Mensagens agendadas respeitam o provedor

A janela de 24h passa a ser checada **apenas** quando o canal é `meta`. O envio
passa pelo helper. O limite diário continua valendo nos dois, como hoje.

### 7. Templates somem no canal Evolution

Template é conceito da Meta. Em canal Evolution a interface esconde a opção, em
vez de deixar o usuário montar um template que volta com "Mensagem vazia" — erro
que não explica nada.

## Erros e observabilidade

A auto-resposta é best-effort por desenho: **nunca** pode quebrar o 200 do
webhook, porque resposta de erro faz o gateway reentregar em laço.

Mas hoje ela engole toda falha **sem log nenhum** — e é o caminho mais caro do
produto. Passa a registrar o motivo da saída (plano bloqueado, suspensa, sem
agente, limite atingido, falha da OpenAI, falha do envio), com o `location_id` e
o motivo. **Nunca** o conteúdo da conversa, a transcrição, a URL assinada ou
qualquer credencial.

Falha de transcrição ou de leitura de imagem não cancela a resposta: a IA
responde como se fosse mídia não interpretada.

## Custo, que é do dono da plataforma

`OPENAI_API_KEY` é global. Toda a defesa é a ordem das guardas e os tetos:

| Defesa | Onde |
|---|---|
| Módulo bloqueado no plano | guarda existente, antes de tudo |
| Empresa suspensa | guarda existente |
| Limite diário do canal | guarda existente |
| Áudio acima de 5 min ou 20 MB | teto novo |
| Transcrição só depois das guardas | ordem, não código novo |
| Imagem só quando há agente ativo | ordem, não código novo |

Os módulos `ai-studio` e `agentes-ia` continuam nascendo **bloqueados** para
empresa nova (`0056`) — liberar é decisão consciente do dono, por empresa.

## Fora de escopo

- Interpretar vídeo e PDF.
- Auto-resposta com mídia (a IA responde só texto).
- Campanhas e automações disparando WhatsApp.
- Transcrição de áudio **enviado** pelo atendente.
- Cota de consumo de IA por empresa (hoje o freio é liberar ou não o módulo).
