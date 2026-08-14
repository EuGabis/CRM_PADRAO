# Calendários: editar, criar pela grade, vincular a lead e arrastar — Design Spec

> A agenda só deixava criar por um botão e excluir pela lista. Agora dá para
> clicar num horário e criar ali, clicar no evento e editar, vincular a um lead
> (além do contato) e arrastar o evento para outro dia/hora.
> Data: 2026-08-14. Convenções: `AGENTS.md`. Migração: **0041**.

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

## Peças

- `supabase/migrations/0041_compromissos_lead.sql`
- `src/lib/data/types.ts` — `Appointment.opportunityId`.
- `src/lib/data/repos/db/appointments.ts` — `update()` e `move()`.
- `src/components/modules/week-calendar.tsx` — dnd-kit (draggable/droppable),
  clique na célula e no evento.
- `src/app/(app)/calendarios/page.tsx` — diálogo único criar/editar, coluna
  "Lead" e linha clicável na lista.

**Sem env nova.**

## Passo manual pendente

Aplicar `0041_compromissos_lead.sql` no SQL Editor. Até lá tudo funciona menos
o vínculo com lead (a coluna não existe e o salvamento falha).
