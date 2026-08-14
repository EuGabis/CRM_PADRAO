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

## "Novo" e o contador

`localStorage` guarda o carimbo da última abertura do sino — estado de tela,
por dispositivo, no mesmo espírito do lembrete de compromisso.

**Compromisso não entra na contagem.** O `at` dele é no futuro, então seria
eternamente "mais novo" que qualquer visita e o contador nunca zeraria. Ele
aparece na lista como contexto; quem avisa da reunião é o lembrete (0042).

## Peças

- `src/components/layout/notifications-panel.tsx` (novo)
- `src/components/layout/topbar.tsx` — o sino passa a abrir a central.
- `src/components/calendar/appointment-reminders.tsx` — o lembrete virou card
  no canto superior direito (era diálogo no meio da tela).

## Fora da v1

Histórico de notificações, marcar item a item como lido, preferências de quais
tipos receber, e notificação do sistema operacional (Notification API).
