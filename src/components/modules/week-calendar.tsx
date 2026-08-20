"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentActions, filterByOwner, useDbAppointments } from "@/lib/data/repos/db/appointments";
import type { Appointment } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8h–19h
const FIRST_HOUR = HOURS[0];
const LAST_HOUR = HOURS[HOURS.length - 1];
/** Altura de uma hora na grade — h-14 (Tailwind) = 3.5rem = 56px. */
const HOUR_HEIGHT_PX = 56;

/** id do droppable = "yyyy-MM-dd|H" (dia + hora da célula). */
const cellId = (day: Date, hour: number) => `${format(day, "yyyy-MM-dd")}|${hour}`;

const isWeekend = (d: Date) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

function EventCard({ appointment, dragging }: { appointment: Appointment; dragging?: boolean }) {
  const google = appointment.source === "google";
  return (
    <div
      className={cn(
        "flex min-h-[34px] flex-col justify-center overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[10px] leading-tight shadow-sm transition-colors",
        google
          ? "border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/80"
          : "border-indigo-500 bg-indigo-50 text-indigo-900 hover:bg-indigo-100/80",
        dragging && "opacity-90 shadow-md ring-2 ring-indigo-300"
      )}
    >
      <p className="truncate font-semibold">{appointment.title}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate font-medium opacity-60">
        {format(new Date(appointment.start), "HH:mm")}–
        {format(new Date(appointment.end), "HH:mm")}
        {appointment.contactId && (
          <span
            className={cn(
              "inline-block size-1 shrink-0 rounded-full",
              google ? "bg-emerald-500" : "bg-indigo-500"
            )}
            title="Vinculado a um contato"
          />
        )}
      </p>
    </div>
  );
}

function DraggableEvent({
  appointment,
  onOpen,
}: {
  appointment: Appointment;
  onOpen: (a: Appointment) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: appointment.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // O clique abre a edição. Com `activationConstraint` de 6px no sensor,
      // um clique curto não vira arraste — mesmo ajuste do kanban de Leads.
      //
      // `stopPropagation` é obrigatório: o card fica DENTRO da célula, que
      // também tem onClick (criar compromisso naquele horário). Sem isso o
      // clique subia para a célula, o rascunho de edição era substituído pelo
      // de criação e o diálogo abria como "Novo compromisso" — sem os dados do
      // evento e sem o botão Excluir.
      onClick={(e) => {
        e.stopPropagation();
        onOpen(appointment);
      }}
      title={`${appointment.title} · clique para editar, arraste para mudar de dia/hora`}
      className={cn(
        "absolute inset-x-0.5 top-0.5 z-10 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <EventCard appointment={appointment} />
    </div>
  );
}

function HourCell({
  day,
  hour,
  children,
  onCreate,
  className,
  bg,
}: {
  day: Date;
  hour: number;
  children: React.ReactNode;
  onCreate: (day: Date, hour: number) => void;
  className?: string;
  /** Fundo sutil de base (hoje / fim de semana), por baixo do hover e do drop. */
  bg?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(day, hour) });
  return (
    <div
      ref={setNodeRef}
      // Clicar no vazio já abre o compromisso naquele dia e hora — o caminho
      // que se espera de uma agenda, em vez de abrir um formulário em branco.
      onClick={() => onCreate(day, hour)}
      className={cn(
        "group relative h-14 cursor-pointer border-b border-slate-100 hover:bg-indigo-50/60",
        bg,
        isOver && "bg-indigo-100/70",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WeekCalendar({
  onEdit,
  onCreateAt,
  /**
   * Filtro de agenda (só admin recebe mais de uma): id do usuário, "__shared__"
   * para os compromissos sem dono, ou undefined/"__all__" para tudo. A RLS já
   * limita o que chega — isto é recorte de visualização, não permissão.
   */
  ownerFilter,
}: {
  onEdit?: (appointment: Appointment) => void;
  onCreateAt?: (day: Date, hour: number) => void;
  ownerFilter?: string;
}) {
  const { appointments: all, loading } = useDbAppointments();
  const appointments = useMemo(() => filterByOwner(all, ownerFilter), [all, ownerFilter]);
  // Tarefa (kind === "tarefa") nasce com end = start — duração zero — e não
  // entra na grade de horários (viraria um sliver fino atravessado). Ela
  // aparece como pílula no cabeçalho do dia (ver `tasksByDay` abaixo), não
  // como bloco na grade. Compromisso continua indo para a grade, como sempre.
  const { events, tasksByDay } = useMemo(() => {
    const events = appointments.filter((a) => a.kind !== "tarefa");
    const tasksByDay = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (a.kind !== "tarefa") continue;
      const key = format(new Date(a.start), "yyyy-MM-dd");
      const list = tasksByDay.get(key);
      if (list) list.push(a);
      else tasksByDay.set(key, [a]);
    }
    return { events, tasksByDay };
  }, [appointments]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Linha da hora atual: recalcula a cada minuto, não a cada render — não há
  // necessidade de mais precisão que isso numa grade de agenda.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayIndex = days.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr);

  // Posição da linha da hora atual dentro da faixa 8h-19h. Fora da faixa
  // (ex.: 21h ou 6h), ou semana sem "hoje", não desenha nada.
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowLineTop =
    todayIndex >= 0 && nowHour >= FIRST_HOUR && nowHour < LAST_HOUR + 1
      ? (nowHour - FIRST_HOUR) * HOUR_HEIGHT_PX
      : null;

  const weekLabel = `${format(days[0], "d", { locale: ptBR })} – ${format(days[6], "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;

  const dragging = draggingId ? appointments.find((a) => a.id === draggingId) ?? null : null;

  const onDragEnd = async (e: DragEndEvent) => {
    setDraggingId(null);
    if (!e.over) return;
    const appointment = appointments.find((a) => a.id === e.active.id);
    if (!appointment) return;

    const [dayStr, hourStr] = String(e.over.id).split("|");
    const start = new Date(appointment.start);
    // Minutos preservados: um evento das 18:30 solto na faixa das 10:00 vira
    // 10:30. Zerar os minutos mudaria silenciosamente o horário combinado.
    const [y, m, d] = dayStr.split("-").map(Number);
    const next = new Date(start);
    next.setFullYear(y, m - 1, d);
    next.setHours(Number(hourStr));

    if (next.getTime() === start.getTime()) return;

    const ok = await appointmentActions.move(appointment.id, next.toISOString());
    if (ok) {
      toast.success(
        `"${appointment.title}" movido para ${format(next, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}`
      );
    } else {
      toast.error("Não foi possível mover o compromisso");
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <ChevronRight className="size-4" />
            </button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            >
              Hoje
            </Button>
            <span className="text-sm font-bold text-slate-800">{weekLabel}</span>
            {loading && <span className="text-[11px] text-slate-400">Carregando...</span>}
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-100 text-indigo-700">Calendário: Reuniões</Badge>
          </div>
        </div>
        {/* Cabeçalho dos dias — grid própria, mesmas colunas do corpo abaixo. */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] text-[10px]">
          <div className="border-b border-r border-slate-100 px-1 py-2.5 font-medium text-slate-400">
            GMT-3
          </div>
          {days.map((d, i) => {
            const dayStr = format(d, "yyyy-MM-dd");
            const dayTasks = tasksByDay.get(dayStr) ?? [];
            const isToday = dayStr === todayStr;
            return (
              <div
                key={i}
                className={cn(
                  "border-b px-1.5 py-2.5 text-center font-semibold",
                  isToday
                    ? "border-b-indigo-100 bg-indigo-50/70 text-indigo-700"
                    : "border-b-slate-100 text-slate-600",
                  isWeekend(d) && !isToday && "bg-slate-50/70",
                  i < 6 && "border-r border-r-slate-100"
                )}
              >
                {format(d, "EEE d", { locale: ptBR })}
                {/* Tarefa é marcador do dia, não bloco de horário — nasce com
                    end = start e viraria um sliver fino se entrasse na grade
                    de slots. Aparece aqui, como pílula, igual a "a fazer" de
                    calendário de verdade. */}
                {dayTasks.length > 0 && (
                  <div className="mt-1 flex flex-col items-stretch gap-0.5">
                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(t);
                        }}
                        title={t.title}
                        className={cn(
                          "truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium normal-case",
                          t.done
                            ? "border-slate-200 bg-slate-100 text-slate-400 line-through"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        )}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Corpo (horas) — grid separada e `relative` para sobrepor a linha da
            hora atual sem depender de posicionamento dentro de um único grid
            gigante (que teria que reservar uma célula explícita e brigar com
            o auto-placement dos slots). */}
        <div className="relative">
          <div className="grid grid-cols-[52px_repeat(7,1fr)] text-[10px]">
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div className="h-14 border-b border-r border-slate-100 px-1.5 pt-1 font-normal text-slate-400">
                  {h}:00
                </div>
                {days.map((d, di) => {
                  const dayStr = format(d, "yyyy-MM-dd");
                  const isToday = dayStr === todayStr;
                  const hourEvents = events.filter((a) => {
                    const start = new Date(a.start);
                    return format(start, "yyyy-MM-dd") === dayStr && start.getHours() === h;
                  });
                  return (
                    <HourCell
                      key={di}
                      day={d}
                      hour={h}
                      onCreate={(day, hour) => onCreateAt?.(day, hour)}
                      className={di < 6 ? "border-r border-r-slate-100" : undefined}
                      bg={
                        isToday
                          ? "bg-indigo-50/40"
                          : isWeekend(d)
                            ? "bg-slate-50/60"
                            : undefined
                      }
                    >
                      {hourEvents.map((e) => (
                        <DraggableEvent
                          key={e.id}
                          appointment={e}
                          onOpen={(a) => onEdit?.(a)}
                        />
                      ))}
                    </HourCell>
                  );
                })}
              </div>
            ))}
          </div>
          {nowLineTop !== null && (
            <div
              className="pointer-events-none absolute z-20 flex items-center"
              style={{
                top: nowLineTop,
                left: `calc(52px + (100% - 52px) * ${todayIndex} / 7)`,
                width: "calc((100% - 52px) / 7)",
              }}
            >
              <span className="-ml-[3px] size-[7px] shrink-0 rounded-full bg-indigo-500" />
              <span className="h-px w-full bg-indigo-500" />
            </div>
          )}
        </div>
      </div>
      <DragOverlay>
        {dragging && (
          <div className="w-[140px]">
            <EventCard appointment={dragging} dragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
