# Card fixo por contato e autonomia da IA no funil — design

**Data:** 2026-08-19

**Objetivo:** cada contato tem **um** card no funil, para sempre o mesmo. A IA
cria em `Novo Lead` e move entre `Novo Lead`, `Em Negociação` e `Perdido`
conforme entende a conversa; `Proposta Enviada` e `Fechado/Ganho` continuam
sendo do humano. O dono do card acompanha o atendente da conversa.

## Decisão do dono, registrada

O desenho anterior travava a IA em `Novo Lead` e `Em Negociação`. O dono pediu
autonomia total e, depois de avisado do risco, recuou para um meio-termo que
mantém a proteção onde ela importa: **`Fechado/Ganho` continua sendo só do
humano**, então o número de vendas da agência não depende de interpretação do
modelo. `Perdido` passou para a IA.

Este parágrafo existe para quem ler o código depois não "consertar" achando que
é inconsistência: a assimetria entre ganho e perdido é deliberada. Errar um
perdido é recuperável — o consultor arrasta o card de volta. Errar um ganho
infla receita e só aparece quando alguém cobra uma venda que não existiu.

O contrapeso geral é o registro: todo movimento grava evento na conversa dizendo
que foi a IA. É a única forma de auditar erro do modelo.

## Arquitetura

### 1. Um card por contato, em qualquer estado

Hoje a busca do card ignora oportunidade `won` ou `lost` — por isso um cliente
que volta ganha card novo. Isso sai.

A IA passa a encontrar o card do contato **em qualquer status**, dentro do funil
da empresa, e a mover esse mesmo. Nunca cria um segundo.

Consequência aceita: um card já perdido pode voltar para negociação quando o mesmo
cliente volta e a conversa retoma. É o preço de "card fixo", e
é coerente com o que o dono pediu — evitar duplicata e erro de contagem.

**A ligação é `contact_id` + funil da empresa.** Não há coluna nova: o contato é
a chave, como o dono descreveu ("cada contato tem um card fixo").

### 2. Três etapas para a IA, duas para o humano

`ETAPAS_DA_IA` passa a ter **três** destinos:

| Etapa | Quem move |
|---|---|
| **Novo Lead** | IA (cria) |
| **Em Negociação** | IA |
| **Perdido** | IA |
| **Proposta Enviada** | só humano |
| **Fechado/Ganho** | só humano |

`Proposta Enviada` é do humano porque quem envia proposta é o consultor, muitas
vezes fora do CRM — a IA não tem como saber que aconteceu. `Fechado/Ganho` é do
humano porque é o número de venda da agência: "pode fechar então!" não é uma
venda, o cliente ainda não pagou nem emitiu.

`Perdido` fica com a IA porque errar um perdido é recuperável e não infla
receita — o consultor vê o card na coluna errada e arrasta de volta.

Sai a regra de "só avança": a IA precisa poder voltar de `Perdido` para
`Em Negociação` quando o cliente reaparece.

**`Fechado/Ganho` é terminal para a IA.** Ela pode mover um card que está em
`Proposta Enviada` (cliente recusou → `Perdido`), mas **nunca tira um card de
`Fechado/Ganho`**. Uma conversa mal interpretada não pode apagar uma venda já
registrada; para reabrir, o humano arrasta.

### 3. O `status` acompanha a etapa

`opportunities.status` é o que alimenta relatório: `won`, `lost` ou `open`.
Quando a IA move para `Perdido` o status vira `lost`; para `Novo Lead` ou
`Em Negociação`, volta a `open`. `won` só é escrito pelo humano, porque só o
humano move para `Fechado/Ganho`.

O projeto já tem essa derivação em dois lugares (`statusForStage` no repo do
funil e `statusForStageName` nas automações). **A IA usa a mesma**, em vez de uma
terceira cópia — três implementações da mesma regra divergem na primeira mudança
de nome de etapa.

### 4. O dono do card acompanha o atendente

Quando a conversa é atribuída a alguém (`conversations.assigned_to`), o
`owner_id` do card daquele contato passa a ser a mesma pessoa.

Isso não é cosmético: a RLS de `opportunities` (`0039`) exige `sees_all` **ou**
`owner_id = auth.uid()`. Sem essa sincronia, um vendedor com visibilidade
restrita recebe a conversa e **não enxerga o card dela** — vê o atendimento e não
vê o negócio.

Vale nos dois sentidos de atribuição: quando um humano atribui pela tela, e
quando a atribuição é removida (o card volta a não ter dono).

### 5. Todo movimento vira evento

Já implementado para IA e para humano; continua igual, e agora cobre as cinco
etapas. O texto diz **quem** fez — IA ou o nome da pessoa.

Acrescenta-se um evento novo para a troca de dono: `Atendimento e card atribuídos
a <nome>`.

## O que continua fora do alcance do modelo

**A trava da imagem não muda.** A IA continua proibida de confirmar pagamento,
valor, comprovante ou documento a partir de imagem, e essa regra segue aplicada
fora do prompt. Autonomia no funil não é autonomia para dizer ao cliente final
que um PIX foi confirmado.

Duas coisas diferentes que é fácil confundir: mover um card é registro interno,
que o consultor vê e corrige; confirmar pagamento é uma afirmação ao cliente
final, que a agência não desfaz.

## Duplicata criada por humano

O dono pediu para evitar card duplicado. Este desenho garante isso **do lado da
IA**: ela nunca cria um segundo card para o mesmo contato.

**Não** se cria restrição no banco impedindo o humano de abrir um segundo card
pelo botão "Adicionar oportunidade". Duas razões: quebraria um fluxo que hoje
funciona, e pode falhar na aplicação se algum contato já tiver dois cards. Se o
dono quiser bloquear também o lado humano, é decisão separada — a tela precisaria
avisar em vez de dar erro de banco.

## Custo e erros

Nada muda: a extração já vem junto da resposta, sem chamada nova, e a ordem das
guardas de custo permanece.

Falha ao mover o card **não** impede a resposta ao cliente — ele é atendido, e a
falha vai para o log com o `location_id` e o código do erro, nunca o conteúdo da
conversa.

## Fora de escopo

- Bloquear no banco a criação de card duplicado por humano.
- IA mover card de contato que não é o da conversa.
- Histórico de mudanças de status para relatório (o evento na conversa cobre a
  auditoria; relatório de vendas continua lendo `status`).
- Desfazer automaticamente um movimento errado da IA.
