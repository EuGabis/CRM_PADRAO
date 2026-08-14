# Central de notificações (sino) — Design Spec

> O sino da topbar só emitia um toast "chega em breve". Agora abre uma central
> com avisos reais. Data: 2026-08-14. Convenções: `AGENTS.md`.
> **Sem migração e sem env nova.**

## Objetivo

Dar lastro ao sino, reunindo num lugar só o que exige ação e hoje só aparece se
a pessoa abrir o módulo certo.

## Decisão principal: derivar, não guardar

**Não existe tabela de notificações.** Cada item é DERIVADO do que já está no
banco. Uma tabela exigiria alguém escrevendo nela em todo lugar — webhook do
WhatsApp, motor de automações, cron do marketing, rotas de envio — e qualquer
caminho esquecido viraria um aviso que nunca chega, sem ninguém perceber.
Derivar não tem como ficar dessincronizado.

O preço é não haver histórico ("o que me avisaram semana passada") nem
notificação de coisa que não deixa rastro no banco. Se um dia isso for
necessário, aí sim vale a tabela.

## O que aparece (v1)

| Tipo | Origem | Ação |
|---|---|---|
| Conversa não lida | `conversations.unread_count > 0`, aberta | abre a conversa |
| Mensagem agendada que falhou | `messages.schedule_status = 'falhou'` | abre a conversa |
| Compromisso nas próximas 24h | store de `appointments` | abre a agenda |

A RLS já limita tudo ao que a pessoa pode ver — inclusive a segmentação por
número (0035) e a agenda por dono (0043).

## Consultas próprias, não os stores dos módulos

O store de Conversas carrega **todas as mensagens da empresa**. O sino vive no
shell, em toda tela: pagar isso só pelo contador seria absurdo. A central faz
duas consultas enxutas com `limit` e só as colunas usadas, e busca os nomes
apenas dos contatos que apareceram.

Atualiza a cada 60s e ao abrir o sino.

## Abas "Não lidas" e "Lidas"

`localStorage` guarda o **conjunto de ids lidos** — estado de tela, por
dispositivo, no mesmo espírito do lembrete de compromisso. É por ITEM, e não um
carimbo de "abri o sino às 14h": com as duas abas, um carimbo mandaria tudo
para "Lidas" de uma vez só por ter aberto o painel. Pelo mesmo motivo, **abrir
o sino não marca nada como lido**.

Marca-se lendo (clicar no item abre a tela e marca junto — é o gesto natural de
"vi isso"), pelo check que aparece ao passar o mouse, ou por "Marcar todas como
lidas". O check vira "desfazer" na aba Lidas.

O contador do sino é o total de não lidas, incluindo compromissos — com estado
por item, o aviso futuro é marcado e some da conta, o que não era possível com
o carimbo único.

**"Lidas" só mostra o que ainda existe.** Os itens são derivados: conversa
respondida ou compromisso que passou some da origem, e a aba não vira um
cemitério de avisos resolvidos. O histórico local é limitado a 300 ids.

## Peças

- `src/components/layout/notifications-panel.tsx` (novo)
- `src/components/layout/topbar.tsx` — o sino passa a abrir a central.
- `src/components/calendar/appointment-reminders.tsx` — o lembrete virou card
  no canto superior direito (era diálogo no meio da tela).

## Fora da v1

Histórico de notificações que já sumiram da origem, preferências de quais tipos
receber, sincronizar "lido" entre dispositivos e notificação do sistema
operacional (Notification API).
