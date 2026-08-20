"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filterByOwner, useDbAppointments } from "@/lib/data/repos/db/appointments";
import type { Appointment } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/** Hora padrão ao criar um compromisso a partir de um dia vazio do mês — a
 * visão de mês não tem faixa de hora, então precisa de um palpite razoável. */
const DEFAULT_HOUR = 9;

/** Quantos eventos mostrar por dia antes de resumir em "+N". */
const MAX_PER_DAY = 3;

function MonthEventPill({
  appointment,
  onOpen,
}: {
  appointment: Appointment;
  onOpen: (a: Appointment) => void;
}) {
  const isTask = appointment.kind === "tarefa";
  const google = appointment.source === "google";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // não deixa o clique "vazar" pro dia (criaria compromisso)
        onOpen(appointment);
      }}
      title={
        isTask
          ? appointment.title
          : `${appointment.title} · ${format(new Date(appointment.start), "HH:mm")}`
      }
      className={cn(
        "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium",
        isTask
          ? cn(
              "rounded-full border",
              appointment.done
                ? "border-slate-200 bg-slate-100 text-slate-400 line-through"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            )
          : google
            ? "border-l-2 border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80"
            : "border-l-2 border-indigo-500 bg-indigo-50 text-indigo-800 hover:bg-indigo-100/80"
      )}
    >
      {!isTask && (
        <span className="mr-1 font-semibold opacity-60">
          {format(new Date(appointment.start), "HH:mm")}
        </span>
      )}
      {appointment.title}
    </button>
  );
}

export function MonthCalendar({
  onEdit,
  onCreateAt,
  ownerFilter,
}: {
  onEdit?: (appointment: Appointment) => void;
  onCreateAt?: (day: Date, hour: number) => void;
  ownerFilter?: string;
}) {
  const { appointments: all, loading } = useDbAppointments();
  const appointments = useMemo(() => filterByOwner(all, ownerFilter), [all, ownerFilter]);

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));

  // Grade clássica de 6 linhas x 7 colunas, domingo primeiro, com dias fora
  // do mês nas pontas para fechar a grade.
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [monthAnchor]);

  // Compromissos e tarefas do mês (mesmo o que "vaza" para fora dele nas
  // pontas da grade), agrupados por dia — nunca filtrar/mapear no selector
  // do Zustand, sempre em useMemo sobre o array cru (AGENTS.md item 4).
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = format(new Date(a.start), "yyyy-MM-dd");
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [appointments]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const monthLabel = format(monthAnchor, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
            className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
            className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="size-4" />
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMonthAnchor(startOfMonth(new Date()))}
          >
            Hoje
          </Button>
          <span className="text-sm font-bold text-slate-800 capitalize">{monthLabel}</span>
          {loading && <span className="text-[11px] text-slate-400">Carregando...</span>}
        </div>
        <Badge className="bg-indigo-100 text-indigo-700">Calendário: Reuniões</Badge>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 text-[10px] font-semibold text-slate-500">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="border-r border-slate-100 px-2 py-2 text-center last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const dayStr = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, monthAnchor);
          const isToday = dayStr === todayStr;
          const dayItems = byDay.get(dayStr) ?? [];
          const shown = dayItems.slice(0, MAX_PER_DAY);
          const extra = dayItems.length - shown.length;
          const weekend = d.getDay() === 0 || d.getDay() === 6;

          return (
            <div
              key={i}
              onClick={() => onCreateAt?.(d, DEFAULT_HOUR)}
              className={cn(
                "flex min-h-[104px] cursor-pointer flex-col gap-0.5 border-b border-r border-slate-100 p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-slate-50/60",
                inMonth && weekend && "bg-slate-50/40",
                isToday && "bg-indigo-50/50",
                "hover:bg-indigo-50/40"
              )}
            >
              <span
                className={cn(
                  "mb-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isToday
                    ? "bg-indigo-600 text-white"
                    : inMonth
                      ? "text-slate-700"
                      : "text-slate-300"
                )}
              >
                {format(d, "d")}
              </span>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {shown.map((a) => (
                  <MonthEventPill key={a.id} appointment={a} onOpen={(ap) => onEdit?.(ap)} />
                ))}
                {extra > 0 && (
                  <span className="px-1 text-[10px] font-medium text-slate-400">+{extra}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
