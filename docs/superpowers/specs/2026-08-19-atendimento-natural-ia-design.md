# Atendimento natural pela IA, com registro no funil — design

**Data:** 2026-08-19

**Objetivo:** a IA atende em conversa natural (sem menu numerado), extrai os dados
do cliente enquanto conversa, cria a oportunidade no funil e registra cada
movimento como evento visível dentro da própria conversa.

## O problema

A cliente (agência de viagem) recusou o atendimento em menu numerado —
"digite 1 para nacional, 2 para internacional". Quer conversa natural.

Isso cria uma tensão real: **menu garante os dados e soa robô; conversa livre
soa natural e não garante nada.** A IA pode trocar dez mensagens simpáticas e
nunca perguntar a data da viagem.

Some-se a isso que hoje a IA não faz nada além de responder: não grava dado
estruturado, não cria oportunidade, não deixa rastro. O consultor precisa ler a
conversa inteira para saber o que o cliente quer.

## Arquitetura

### 1. Uma chamada só devolve resposta e dados

Em vez de a IA responder e um segundo modelo reler a conversa para extrair
campos — o que dobraria o custo por mensagem, na conta do dono da plataforma —
a chamada pede as duas coisas de uma vez, em JSON garantido pela API
(`response_format: json_object`):

```
{
  "resposta": "texto natural que vai para o cliente",
  "dados": { "origem": "...", "destino": "...", "data_ida": "...",
             "passageiros": "...", ... },
  "etapa_sugerida": "novo-lead" | "em-negociacao" | null
}
```

O cliente recebe **apenas** o campo `resposta`.

**Se o JSON vier malformado, o CRM não manda nada cru para o WhatsApp.** Tenta
de novo uma vez; se falhar de novo, registra e fica em silêncio naquela rodada.
Mandar chaves de JSON para o cliente final da cliente é pior que não responder.

Os campos de `dados` são acumulados no `contacts.custom_fields` (jsonb que já
existe) — campo vazio nunca sobrescreve valor já preenchido, porque o cliente
informa aos poucos e a IA pode não repetir o que já sabe.

### 2. O limite da movimentação vive no código, não no prompt

**Este é o ponto que sustenta a confiança no funil.** Pedir ao modelo "não mova
para Ganho" é um pedido, não uma garantia: basta uma conversa criativa para ele
desobedecer.

A regra é uma **lista fechada no servidor**:

| Transição | Quem pode |
|---|---|
| criar em **Novo Lead** | IA |
| → **Em Negociação** | IA |
| → **Proposta Enviada** | só humano |
| → **Fechado/Ganho** | só humano |
| → **Perdido** | só humano |

`etapa_sugerida` fora dessa lista é **ignorada**, e a recusa é registrada em log.
A IA nunca decide receita: "pode fechar então!" não é uma venda — o cliente ainda
não pagou nem emitiu. Se a interpretação do modelo virasse número de venda, o
relatório da agência viraria ficção e ninguém confiaria mais no funil.

### 3. Uma oportunidade por conversa

A oportunidade é criada **uma vez**, na primeira rodada em que a IA identificar
intenção real. As rodadas seguintes atualizam a mesma. Sem isso, cada mensagem
do cliente viraria um card novo e o funil viraria lixo em uma tarde.

### 4. O log dentro da conversa

`messages` já aceita `type = 'event'`, e a inbox **já renderiza** esses registros
(`PipelineEvent`, em `src/components/inbox/thread.tsx`). Hoje nada no código real
os cria — só os dados de exemplo. A peça está pronta na tela e desligada no
backend.

Passam a gerar evento, na própria conversa:

- oportunidade criada em **Novo Lead**;
- movida para **Em Negociação** pela IA;
- movida por um humano (qualquer etapa, incluindo Ganho e Perdido);
- conversa **encerrada**, com quem encerrou;
- **anotação** interna registrada.

Cada evento diz **quem** fez — IA ou o nome da pessoa. É isso que permite ao
consultor abrir a conversa e entender a história sem ler tudo, e é isso que
torna auditável uma automação que mexe no funil.

### 5. O funil padrão

Empresa nova nasce hoje com nove etapas de venda de SaaS ("TESTE GRÁTIS",
"ASSINOU", "FILA DEMO") — herança do funil do dono da plataforma, sem sentido
para uma agência de viagem. O padrão passa a ser cinco:

| Etapa | Cor |
|---|---|
| Novo Lead | azul |
| Proposta Enviada | laranja |
| Em Negociação | roxo |
| Fechado/Ganho | verde |
| Perdido | vermelho |

`stages.color` já existe; nenhuma coluna nova é necessária.

**Empresa que já existe não é tocada pela migração.** O ajuste do funil da
GAABTUR é um script separado, e com trava: se alguma etapa que sairia já tiver
oportunidade dentro, ele **recusa** em vez de deixar card órfão. Reescrever
funil de cliente em produção sem essa checagem é como perder trabalho de vendas
em silêncio.

## Custo

`OPENAI_API_KEY` é global, na conta do dono da plataforma. O desenho não
acrescenta chamada nenhuma: a extração vai junto da resposta que já acontecia.
Todas as guardas atuais continuam valendo e nesta ordem — chave, módulo
`whatsapp`, módulo `agentes-ia`, empresa suspensa, canal entregável,
`bot_paused`, agente ativo, limite diário — e só então se gasta.

O JSON estruturado é levemente mais caro em tokens de saída que texto puro. Em
troca, elimina a segunda chamada que a alternativa exigiria.

## Erros

A auto-resposta continua **best-effort**: nunca pode quebrar o 200 do webhook,
porque erro faz o gateway reentregar em laço.

Falha ao criar ou mover a oportunidade **não** impede a resposta ao cliente — ele
recebe o atendimento, e a falha vai para o log. O contrário (deixar o cliente sem
resposta porque um insert falhou) é pior para quem está do outro lado.

Log registra o motivo e o `location_id`, **nunca** o conteúdo da conversa, os
dados do cliente final, a transcrição ou credencial.

## O que o código não resolve

**O tom é da cliente, não nosso.** O código garante que os dados sejam coletados
sem menu numerado; se a IA soa robótica ou natural depende do texto que a agência
escrever na personalidade do agente. O `AGENTS.md` ganha um exemplo de
personalidade pronto, em conversa natural, para ela partir de algo que já
funciona em vez de uma caixa vazia.

## Fora de escopo

- IA mover para Proposta Enviada, Ganho ou Perdido (decisão registrada acima).
- IA enviar proposta, cotação ou documento.
- Funil configurável por empresa pela tela da plataforma (hoje o dono ajusta por SQL).
- Auto-resposta com mídia no canal Meta (segue só texto lá).
- Relatório de desempenho da IA.
