# Calendários: editar, criar pela grade, vincular a lead e arrastar — Design Spec

> A agenda só deixava criar por um botão e excluir pela lista. Agora dá para
> clicar num horário e criar ali, clicar no evento e editar, vincular a um lead
> (além do contato), arrastar o evento para outro dia/hora e ser avisado por um
> popup no CRM na antecedência escolhida.
> Data: 2026-08-14. Convenções: `AGENTS.md`. Migrações: **0041** e **0042**.

## Objetivo

Fechar os quatro buracos do módulo: sem edição, sem criação pelo grid, sem
vínculo com o funil e sem arrastar.

## Não-objetivos (v1)

- Redimensionar o evento pela borda (mudar duração arrastando).
- Vista de dia/mês (continua semana).
- Sincronizar com o Google Calendar (segue futuro).
- Recorrência e convidados.
- Arrastar com precisão de minutos (a célula é de 1 hora — ver abaixo).

## Vínculo com lead (migração 0041)

`appointments.opportunity_id` → `opportunities`, com **`on delete set null`**:
excluir a oportunidade não pode apagar a reunião da agenda de ninguém. O
compromisso fica, só perde o vínculo — mesmo critério do `contact_id` da 0001.

**O contato continua existindo e é independente.** Um compromisso pode ter
contato sem lead (uma conversa que ainda não virou negociação), lead sem
contato, ou os dois. Escolher o lead **preenche o contato quando ele está
vazio**: é sempre o mesmo contato da oportunidade, e digitar de novo só criaria
chance de vincular a pessoa errada. Se já havia contato, nada é sobrescrito.

Índice parcial em `opportunity_id` (a maioria dos compromissos não tem lead).

Sem policy nova: `appointments` já tem RLS de membership desde a 0001 e a coluna
entra na mesma linha.

## Arrastar: o que muda e o que não muda

A célula da grade é de **uma hora**, então o alvo do drop é dia + hora.

- **Minutos são preservados**: um evento das 18:30 solto na faixa das 10:00 vira
  10:30. Zerar os minutos mudaria em silêncio um horário que foi combinado com
  alguém.
- **A duração é preservada**: `appointmentActions.move` recalcula o fim a partir
  do novo início, senão uma reunião de 2h viraria 45min só por mudar de dia.
- **Otimista com rollback**: a grade mostra o evento no lugar novo antes da
  resposta e volta sozinha se o banco recusar.

`PointerSensor` com `activationConstraint: { distance: 6 }` — o mesmo do kanban
de Leads. É o que permite **clicar** no evento (abre a edição) sem que o clique
vire arraste.

## Criar pelo grid

Clicar numa célula vazia abre o diálogo já com aquele dia e hora, das `HH:00`
às `HH:45` (a duração padrão sugerida nas Configurações do módulo). O botão
"Novo compromisso" continua, abrindo em branco.

## Um diálogo para os dois casos

`AppointmentDialog` recebe um *rascunho*: `{ appointment }` (editando) ou
`{ appointment: null, slot }` (criando naquele horário). Dois diálogos quase
idênticos divergiriam no primeiro campo novo.

O rascunho é copiado para o estado **durante o render** (guardado por um
snapshot), não num efeito: `useEffect` só para copiar prop dispara um render
extra a cada abertura.

Excluir passou a viver no diálogo de edição, além da lista.

## Detalhe: sentinela nos selects

Os campos de contato e lead são opcionais, mas um `SelectItem` de valor vazio
não é caso tratado pelo Base UI (o item não fica selecionável). Os selects usam
a sentinela `"__none__"`, convertida para `""` na leitura.

## Lembrete dentro do CRM (migração 0042)

`appointments.reminder_minutes` (null = sem lembrete, o default — nenhum
compromisso existente passa a avisar do nada). Antecedências oferecidas: na
hora, 5/10/15/30 min, 1h, 2h e 1 dia. Teto de 7 dias no `check` da coluna:
acima disso o aviso deixa de ser lembrete e vira ruído de semanas antes.

**Fica no compromisso, não numa preferência do usuário.** O aviso é da
REUNIÃO: "1 dia antes" faz sentido para uma visita e é ruído para um retorno de
10 minutos. Quem marca decide, e vale para todos que enxergam o compromisso.

**O popup mora no shell** (`(app)/layout.tsx`) — um aviso que só aparece com o
módulo Calendários aberto não serviria para nada. Mostra título, horário,
contato (com telefone), lead e calendário, com "Lembrar em 5 min", "Abrir
agenda" e "Ok".

Três decisões do motor:

- **"Já avisei" fica no `localStorage`**, não no banco: é estado de tela, por
  dispositivo. Marcar no banco esconderia o aviso no computador porque o
  celular mostrou primeiro.
- **Janela de disparo**, e não "passou da hora": só avisa entre
  `início - lembrete` e `início + 15 min`. Sem isso, abrir o CRM depois do
  almoço despejaria os avisos da manhã inteira de uma vez.
- **Recarrega a agenda a cada 5 min**: a store carrega uma vez só, e sem isso um
  compromisso criado em outro dispositivo nunca avisaria aqui.

Fora da v1: notificação do sistema operacional (Notification API), lembrete por
WhatsApp/e-mail (os toggles das Configurações do módulo seguem decorativos) e
mais de um lembrete por compromisso.

## Peças

- `supabase/migrations/0041_compromissos_lead.sql`
- `supabase/migrations/0042_compromissos_lembrete.sql`
- `src/components/calendar/appointment-reminders.tsx` — motor + popup, montado
  em `(app)/layout.tsx`.
- `src/lib/data/types.ts` — `Appointment.opportunityId`.
- `src/lib/data/repos/db/appointments.ts` — `update()` e `move()`.
- `src/components/modules/week-calendar.tsx` — dnd-kit (draggable/droppable),
  clique na célula e no evento.
- `src/app/(app)/calendarios/page.tsx` — diálogo único criar/editar, coluna
  "Lead" e linha clicável na lista.

**Sem env nova.**

## Passo manual pendente

Aplicar `0041_compromissos_lead.sql` e `0042_compromissos_lembrete.sql` no SQL
Editor. Até lá tudo funciona menos o vínculo com lead e o lembrete (as colunas
não existem e o salvamento falha).
