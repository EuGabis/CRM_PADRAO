# Conversas: template em lote + enviar contato para pipeline — Design Spec

> Duas ações que faltavam na caixa de entrada: (1) selecionar várias conversas e
> disparar um **template** aprovado para todas; (2) mandar o contato da conversa para
> um **pipeline de Leads** direto do painel da direita. Data: 2026-08-14.
> Convenções: `AGENTS.md`.

## Objetivo

Fechar dois caminhos que hoje obrigam a sair da tela: avisar vários contatos de uma vez
(hoje: abrir conversa por conversa) e transformar um atendimento em oportunidade
(hoje: ir ao módulo Leads e criar na mão, procurando o contato de novo).

## Não-objetivos (v1)

- Texto livre em lote — fora da janela de 24h o WhatsApp não permite, e parte da
  seleção sempre está fora dela. Em lote, só template.
- Variáveis por contato no template (`{{1}}`) — v1 envia template sem parâmetros.
- Agendar o envio em lote (o agendamento continua sendo por conversa, no composer).
- Outras ações em massa (finalizar, arquivar, atribuir) — a seleção já fica pronta
  para isso, mas não entram agora.
- Mover a oportunidade / escolher dono na criação: nasce com o dono sendo quem criou,
  igual ao kanban.

## Envio em lote: um POST por conversa, em série

`POST /api/whatsapp/send` já valida canal, janela de 24h, limite diário do canal e
grava a mensagem de saída. Um endpoint novo "em lote" duplicaria essa regra e as duas
versões divergiriam na primeira mudança. Então o diálogo chama a rota existente **uma
vez por conversa**.

**Em série, não em paralelo:** o limite diário do canal é contado por requisição; em
rajada, metade da lista voltaria 429 sem nenhum controle de quem foi e quem não foi.
Em série dá para mostrar "Enviando 3 de 12…" e listar exatamente quem falhou.

**Falhas são nominais.** "3 não enviadas" sem dizer quais obriga o atendente a conferir
conversa por conversa — o toast lista até 5 nomes com o motivo de cada uma.

**Conversas sem canal de WhatsApp** (e-mail, Instagram, WhatsApp sem `channel_id`)
aparecem separadas ANTES do envio, com nome, em vez de virarem falha depois.

## Efeito colateral herdado: `bot_paused`

A rota de envio marca `conversations.bot_paused = true` — é o handoff manual do
auto-responder. Um disparo em lote portanto **pausa o bot de IA em todas as conversas
atingidas**. É o comportamento correto (um humano falou), mas é bom saber: para
religar, a conversa precisa voltar a `bot_paused = false`.

## Enviar para pipeline

Botão no **cabeçalho** do painel do contato (não dentro da aba "Ações"), para aparecer
em qualquer aba. Abre diálogo com pipeline + fase + valor opcional e chama
`oppActions.add` — a mesma ação do kanban, com `source: "Conversas"` para dar pra
medir depois quantos leads nasceram do atendimento.

**Mostra as oportunidades que o contato já tem.** Sem isso, o caminho natural (o
atendente manda o mesmo lead toda vez que conversa) enche o funil de duplicatas sem
ninguém perceber. O aviso não bloqueia — repetir pode ser legítimo (nova compra).

Pipeline e fase já vêm preenchidos com o primeiro de cada: o caso comum é "joga no
funil padrão" e não deveria custar dois cliques.

## Peças

- `src/components/inbox/bulk-template-dialog.tsx` — diálogo do envio em lote (novo).
- `src/components/inbox/send-to-pipeline-dialog.tsx` — diálogo da oportunidade (novo).
- `src/components/inbox/conversation-list.tsx` — modo seleção (ícone na barra do
  título), checkbox por linha, barra "N selecionadas · Enviar template".
- `src/components/inbox/contact-panel.tsx` — botão "Enviar para pipeline".

**Sem migração nova, sem env nova e sem rota nova.**

## Detalhe de implementação

A linha da lista era um `<button>` único; com o checkbox virou
`<div>` + checkbox irmão + `<button>` do conteúdo — checkbox dentro de button é HTML
inválido e o clique ficaria ambíguo.

Os alvos do envio são resolvidos na lista **completa** (`useConversations("all")`), não
na lista filtrada: selecionar e depois trocar de aba faria o envio sair com menos
conversas do que o contador mostra.
