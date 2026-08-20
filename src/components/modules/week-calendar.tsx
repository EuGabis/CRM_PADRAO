"use client";

import { useMemo, useState } from "react";
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
import { appointmentActions, useDbAppointments } from "@/lib/data/repos/db/appointments";
import type { Appointment } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8h–19h

/** id do droppable = "yyyy-MM-dd|H" (dia + hora da célula). */
const cellId = (day: Date, hour: number) => `${format(day, "yyyy-MM-dd")}|${hour}`;

function EventCard({ appointment, dragging }: { appointment: Appointment; dragging?: boolean }) {
  const google = appointment.source === "google";
  return (
    <div
      className={cn(
        "overflow-hidden rounded border-l-2 px-1 py-0.5 text-[10px] shadow-sm",
        google
          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
          : "border-indigo-500 bg-indigo-50 text-indigo-800",
        dragging && "opacity-90 ring-2 ring-indigo-300"
      )}
    >
      <p className="truncate font-semibold">{appointment.title}</p>
      <p className="truncate opacity-70">
        {format(new Date(appointment.start), "HH:mm")}–
        {format(new Date(appointment.end), "HH:mm")}
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
}: {
  day: Date;
  hour: number;
  children: React.ReactNode;
  onCreate: (day: Date, hour: number) => void;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(day, hour) });
  return (
    <div
      ref={setNodeRef}
      // Clicar no vazio já abre o compromisso naquele dia e hora — o caminho
      // que se espera de uma agenda, em vez de abrir um formulário em branco.
      onClick={() => onCreate(day, hour)}
      className={cn(
        "group relative h-14 cursor-pointer border-b hover:bg-indigo-50/40",
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
  const appointments = useMemo(() => {
    if (!ownerFilter || ownerFilter === "__all__") return all;
    if (ownerFilter === "__shared__") return all.filter((a) => !a.ownerId);
    return all.filter((a) => a.ownerId === ownerFilter);
  }, [all, ownerFilter]);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayStr = format(new Date(), "yyyy-MM-dd");

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
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="flex size-7 items-center justify-center rounded-md border text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="flex size-7 items-center justify-center rounded-md border text-slate-500 hover:bg-slate-50"
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
            <Badge variant="secondary">Semana</Badge>
            <Badge className="bg-indigo-100 text-indigo-700">Calendário: Reuniões</Badge>
          </div>
        </div>
        <div className="grid grid-cols-[52px_repeat(7,1fr)] text-[10px]">
          <div className="border-b border-r px-1 py-2 text-slate-400">GMT-3</div>
          {days.map((d, i) => {
            const dayTasks = tasksByDay.get(format(d, "yyyy-MM-dd")) ?? [];
            return (
              <div
                key={i}
                className={cn(
                  "border-b px-1.5 py-2 text-center font-semibold",
                  format(d, "yyyy-MM-dd") === todayStr
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600",
                  i < 6 && "border-r"
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
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div className="h-14 border-b border-r px-1 pt-0.5 text-slate-400">{h}:00</div>
              {days.map((d, di) => {
                const dayStr = format(d, "yyyy-MM-dd");
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
                    className={di < 6 ? "border-r" : undefined}
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
