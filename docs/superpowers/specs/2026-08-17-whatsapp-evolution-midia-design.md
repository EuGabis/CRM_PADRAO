# Mídia no canal Evolution — design

**Data:** 2026-08-17
**Objetivo:** o canal WhatsApp não oficial (Evolution) passa a enviar e receber
imagem, áudio, vídeo e documento, com o mesmo comportamento que o canal Meta já
tem hoje.

## Contexto: o que já existe

Nada disto precisa ser construído — o caminho Meta já usa tudo:

- Bucket **privado** `conversation-media` (migração `0019`), com políticas de
  `storage.objects` que isolam por empresa pelo primeiro segmento do caminho.
- Caminho padrão dos objetos: `{location_id}/{conversation_id}/{uuid}.{ext}`.
- Colunas `media_path`, `media_name`, `media_mime`, `media_size` em
  `public.messages`.
- Tipos aceitos em `messages_type_check`: `text`, `audio`, `image`, `file`,
  `event` (`0019`) mais `video` (`0038`). **Documento é `file`.**
- A inbox já renderiza mídia a partir dessas colunas, usando URL assinada
  temporária. **Nenhuma tela precisa mudar.**
- `POST /api/whatsapp/send-media` já envia mídia pela Meta.
- O webhook da Meta já baixa a mídia recebida e grava no bucket.

O canal Evolution hoje só trata texto, nos dois sentidos.

## Arquitetura

Quatro peças. O caminho Meta não é tocado em nenhuma delas — ele está em
produção, e a bifurcação por `whatsapp_channels.provider` segue o padrão que a
rota de texto já usa.

### 1. Cliente da Evolution (`src/lib/evolution/client.ts`)

Duas funções novas, ambas recebendo **URL** em vez de bytes:

- `sendMedia(instancia, token, paraE164, tipo, url, nomeArquivo, legenda)` —
  imagem, vídeo e documento.
- `sendWhatsAppAudio(instancia, token, paraE164, url)` — áudio de voz.

Uma função de leitura:

- `baixarMidia(instancia, token, chaveDaMensagem)` — devolve os bytes de uma
  mídia recebida.

Todas usam o **token da instância**, nunca a chave global do gateway, pelo mesmo
motivo já documentado no topo daquele arquivo.

### 2. Envio: bifurcar `POST /api/whatsapp/send-media`

Mesma estrutura da bifurcação que a rota de texto recebeu:

- `provider = 'meta'` → **byte a byte o comportamento atual**.
- `provider = 'evolution'` → recusa se `connection_state != 'open'`, valida o
  tamanho, gera uma URL assinada de curta duração do objeto no bucket e chama
  `sendMedia` ou `sendWhatsAppAudio` conforme o tipo.

O limite diário (`daily_limit`) fica **fora** dos dois ramos: é regra do
produto, não do provedor.

O `evolution_token` é segredo e não é legível pela sessão do usuário desde a
`0058`. A rota busca o token à parte com `createAdminClient()`, escopado pelo
`channel.id` que a RLS já validou — mesmo padrão da rota de texto.

### 3. Recebimento: mídia no webhook da Evolution

O webhook passa a reconhecer `imageMessage`, `audioMessage`, `videoMessage` e
`documentMessage` dentro de `body.data.message`, além do texto que já trata.

Fluxo, nesta ordem:

1. Identifica o canal pela instância (como já faz) e checa idempotência por
   `wa_message_id` (como já faz).
2. Deriva tipo (`image`/`audio`/`video`/`file`), mime e nome do arquivo.
3. Se o tamanho declarado passar do limite, **pula o download** e segue para o
   passo 6 marcando a mídia como não guardada.
4. Chama `baixarMidia` para obter os bytes.
5. Sobe para `conversation-media` em
   `{location_id}/{conversation_id}/{uuid}.{ext}` usando a service role, e
   preenche `media_path/name/mime/size`.
6. Grava a mensagem.

**Por que o download é sob demanda e não embutido no webhook:** a Evolution pode
mandar o arquivo em base64 dentro do próprio POST (`webhookBase64: true`). Um
vídeo de 16 MB vira um corpo de ~21 MB em toda mensagem, e uma rajada de mídia
derruba a função. Sob demanda o webhook continua leve e só busca o arquivo
depois de já ter reconhecido o canal — quem manda lixo para o endpoint não faz a
gente baixar nada.

### 4. Limites, num lugar só

Um módulo único define os tetos, aplicados **nos dois sentidos**:

| Tipo | Limite |
|---|---|
| Imagem | 5 MB |
| Áudio | 16 MB |
| Vídeo | 16 MB |
| Documento | 100 MB |

São os mesmos limites do WhatsApp: aceitar acima disso seria guardar no Storage
um arquivo que o WhatsApp recusaria adiante.

## Fluxo dos bytes

**Enviando:** o arquivo já está no bucket (o composer sobe antes de chamar a
rota). A rota gera uma URL assinada temporária e entrega **a URL** ao gateway,
que baixa sozinho. Nenhum byte passa pela nossa função — some o teto de memória,
e o documento de 100 MB deixa de ser um problema de infraestrutura.

Contrapartida aceita: a URL assinada é um link temporário para o arquivo do
cliente, entregue ao gateway. O gateway é do dono da plataforma. A URL expira em
minutos e não é registrada em log.

**Recebendo:** os bytes passam pela função uma vez, do gateway para o Storage.
É inevitável — o Storage não busca de terceiros.

## Erros

**Mensagem com mídia que falhar não some.** Se o arquivo passar do limite, se o
download falhar ou se o upload falhar, a mensagem **ainda é gravada** e aparece
na inbox marcada como mídia não disponível. Perder a mensagem de um cliente em
silêncio é pior que mostrá-la incompleta — e o atendente precisa saber que
alguém mandou algo, mesmo sem conseguir ver o quê.

O webhook continua respondendo **200 sempre**, inclusive nos erros internos: um
retorno de erro faz o gateway reenfileirar e reenviar em laço.

Log de falha de mídia registra o tipo, o tamanho e o motivo — **nunca** o
conteúdo do arquivo, o nome do arquivo do cliente, o `evolution_token` nem a URL
assinada.

No envio, falha do gateway devolve mensagem genérica: o erro cru ecoa o nome da
instância no path.

## Sonda antes de codificar

Os formatos reais da Evolution **não estão confirmados**. Na fase anterior a
sonda achou três divergências (o token vem em `hash` na raiz; o QR vem aninhado
no `create` e plano no `connect`; a rota de webhook é `POST /webhook/set/{nome}`
com corpo aninhado) que teriam quebrado em produção sem o build acusar nada.

A primeira tarefa do plano confirma, contra o gateway real:

1. O endpoint de envio de mídia aceita **URL** no campo do arquivo, ou só
   base64?
2. Como se chamam os campos de tipo, nome do arquivo e legenda?
3. O endpoint de áudio de voz **converte sozinho** o `webm` do navegador, ou
   exige um formato específico?
4. Qual endpoint devolve os bytes de uma mídia recebida, e o que ele exige — a
   chave da mensagem ou a mensagem inteira?
5. Onde ficam, no payload de `MESSAGES_UPSERT`, o mime, o nome do arquivo e o
   tamanho de cada um dos quatro tipos?

**Restrição inegociável:** o gateway hospeda a instância `Teste`, de outro
projeto do dono, com número real. A sonda usa **apenas** a instância do CRM e
não lê, altera nem apaga nenhuma outra.

## Fora de escopo

- Auto-resposta com IA para mídia recebida (o canal Evolution não tem
  auto-resposta nem para texto — lacuna já registrada).
- Cota de armazenamento por empresa. Fica o limite por arquivo; cota por empresa
  entra se o consumo justificar.
- Mídia em mensagens agendadas e em campanhas.
- Figurinhas, localização e contato compartilhado.
