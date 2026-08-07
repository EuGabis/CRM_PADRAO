"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDbAppointments } from "@/lib/data/repos/db/appointments";

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8h–19h

export function WeekCalendar() {
  const { appointments, loading } = useDbAppointments();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const weekLabel = `${format(days[0], "d", { locale: ptBR })} – ${format(days[6], "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;

  return (
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
        {days.map((d, i) => (
          <div
            key={i}
            className={`border-b px-2 py-2 text-center font-semibold ${
              format(d, "yyyy-MM-dd") === todayStr
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600"
            } ${i < 6 ? "border-r" : ""}`}
          >
            {format(d, "EEE d", { locale: ptBR })}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div className="h-14 border-b border-r px-1 pt-0.5 text-slate-400">{h}:00</div>
            {days.map((d, di) => {
              const dayStr = format(d, "yyyy-MM-dd");
              const events = appointments.filter((a) => {
                const start = new Date(a.start);
                return format(start, "yyyy-MM-dd") === dayStr && start.getHours() === h;
              });
              return (
                <div key={di} className={`relative h-14 border-b ${di < 6 ? "border-r" : ""}`}>
                  {events.map((e) => (
                    <div
                      key={e.id}
                      title={`${e.title} · ${format(new Date(e.start), "HH:mm")}–${format(new Date(e.end), "HH:mm")} · ${e.source === "google" ? "Google Agenda" : "Lito"}`}
                      className={`absolute inset-x-0.5 top-0.5 z-10 cursor-default overflow-hidden rounded border-l-2 px-1 py-0.5 ${
                        e.source === "google"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-indigo-500 bg-indigo-50 text-indigo-800"
                      }`}
                    >
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="truncate opacity-70">
                        {format(new Date(e.start), "HH:mm")}–{format(new Date(e.end), "HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
