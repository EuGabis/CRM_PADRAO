"use client";

import { useState } from "react";
import { CalendarDays, List, Settings } from "lucide-react";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { WeekCalendar } from "@/components/modules/week-calendar";

const TABS = [
  { label: "Visualização de calendário" },
  { label: "Lista de compromissos" },
  { label: "Configurações" },
];

export default function CalendariosPage() {
  const [tab, setTab] = useState(TABS[0].label);
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Visualização de calendário" ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Calendários</h1>
              <p className="text-xs text-slate-500">
                Sincronizado com Google Calendar · eventos verdes vêm do Google
              </p>
            </div>
            <WeekCalendar />
          </>
        ) : (
          <EmptyState
            icon={tab === "Configurações" ? Settings : tab === "Lista de compromissos" ? List : CalendarDays}
            title={`${tab} — em construção`}
            description="Esta visão do módulo de Calendários será aprofundada nas próximas etapas."
          />
        )}
      </div>
    </div>
  );
}
