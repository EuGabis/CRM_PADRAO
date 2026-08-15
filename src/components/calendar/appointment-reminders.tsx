"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Clock, Target, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contactName } from "@/lib/data/repos/contacts";
import { useApptStore, useDbAppointments } from "@/lib/data/repos/db/appointments";
import { useDbContacts } from "@/lib/data/repos/db/contacts";
import { useDbOpportunities } from "@/lib/data/repos/db/pipeline";
import type { Appointment } from "@/lib/data/types";

/**
 * Lembrete de compromisso dentro do CRM (migração 0042).
 *
 * Mora no shell (`(app)/layout.tsx`) para avisar em qualquer tela — um aviso
 * que só aparece com o módulo Calendários aberto não serve para nada.
 *
 * Decisões que valem registro:
 *
 * - **"Já avisei" fica no localStorage**, não no banco: é estado de tela, por
 *   dispositivo. Marcar no banco esconderia o aviso no computador porque o
 *   celular mostrou primeiro.
 * - **Janela de disparo**, e não "passou da hora": só avisa entre
 *   `início - lembrete` e `início + TOLERÂNCIA`. Sem isso, abrir o CRM depois
 *   do almoço despejaria os avisos da manhã inteira de uma vez.
 * - **Recarrega a agenda de tempos em tempos**: a store carrega uma vez só, e
 *   sem isso um compromisso criado em outro dispositivo nunca avisaria aqui.
 */

const CHECK_MS = 30_000; // varredura
const RELOAD_MS = 5 * 60_000; // relê a agenda do banco
const LATE_TOLERANCE_MIN = 15; // atraso máximo para ainda valer o aviso
const STORAGE_KEY = "crm.appointment-reminders.shown";

/** Ids já avisados NESTE navegador (sobrevive ao F5). */
function loadShown(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveShown(ids: Set<string>) {
  try {
    // Guarda os 200 mais recentes: a lista cresceria para sempre e só
    // interessa o passado próximo.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // localStorage cheio ou bloqueado — o lembrete some no F5, não quebra nada.
  }
}

export function AppointmentReminders() {
  const { appointments } = useDbAppointments();
  const { contacts } = useDbContacts();
  const opportunities = useDbOpportunities();
  // Guarda também os minutos que faltavam QUANDO o aviso apareceu: calcular
  // `Date.now()` no render deixaria o componente impuro (e o número mudaria
  // sozinho a cada re-render, sem o popup ter mudado).
  const [due, setDue] = useState<{ appointment: Appointment; minutesLeft: number } | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});

  // Varredura + recarga periódica. Um efeito só: os dois timers vivem e morrem
  // juntos com o componente.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const shown = loadShown();
      const next = appointments.find((a) => {
        if (a.reminderMinutes === null || a.reminderMinutes === undefined) return false;
        if (shown.has(a.id)) return false;
        const snoozedUntil = snoozed[a.id];
        if (snoozedUntil && now < snoozedUntil) return false;
        const start = new Date(a.start).getTime();
        const from = start - a.reminderMinutes * 60_000;
        const until = start + LATE_TOLERANCE_MIN * 60_000;
        return now >= from && now <= until;
      });
      if (next) {
        const minutesLeft = Math.round((new Date(next.start).getTime() - now) / 60_000);
        setDue((cur) => cur ?? { appointment: next, minutesLeft });
      }
    };

    check();
    const tick = setInterval(check, CHECK_MS);
    const reload = setInterval(() => void useApptStore.getState().reload(), RELOAD_MS);
    return () => {
      clearInterval(tick);
      clearInterval(reload);
    };
  }, [appointments, snoozed]);

  const dismiss = () => {
    if (!due) return;
    const shown = loadShown();
    shown.add(due.appointment.id);
    saveShown(shown);
    setDue(null);
  };

  const snooze = () => {
    if (!due) return;
    // Adiar NÃO marca como avisado: some por 5 minutos e volta.
    setSnoozed((prev) => ({ ...prev, [due.appointment.id]: Date.now() + 5 * 60_000 }));
    setDue(null);
  };

  if (!due) return null;

  const { appointment, minutesLeft } = due;
  const start = new Date(appointment.start);
  const end = new Date(appointment.end);
  const contact = appointment.contactId
    ? contacts.find((c) => c.id === appointment.contactId)
    : null;
  const opportunity = appointment.opportunityId
    ? opportunities.find((o) => o.id === appointment.opportunityId)
    : null;

  return (
    // Canto superior direito, logo abaixo da topbar (h-12). Card fixo em vez de
    // diálogo: o aviso não pode bloquear a tela nem tirar o foco de quem está
    // no meio de uma conversa.
    <div
      role="alert"
      className="fixed right-4 top-16 z-50 w-80 animate-in slide-in-from-top-2 fade-in rounded-xl border border-indigo-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
          <CalendarClock className="size-3.5" />
          {minutesLeft > 0
            ? `Compromisso em ${minutesLeft} min`
            : minutesLeft === 0
              ? "Compromisso agora"
              : `Compromisso começou há ${Math.abs(minutesLeft)} min`}
        </p>
        <button
          onClick={dismiss}
          title="Dispensar"
          className="flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-slate-800">{appointment.title}</p>
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="size-3.5 shrink-0 text-slate-400" />
          {format(start, "EEEE, dd 'de' MMMM · HH:mm", { locale: ptBR })}–{format(end, "HH:mm")}
        </p>
        {contact && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <User className="size-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              {contactName(contact)}
              {contact.phone ? ` · ${contact.phone}` : ""}
            </span>
          </p>
        )}
        {opportunity && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <Target className="size-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{opportunity.name}</span>
          </p>
        )}
        <p className="text-[11px] text-slate-400">Calendário: {appointment.calendar}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={snooze}>
          Lembrar em 5 min
        </Button>
        <span className="flex items-center gap-1.5">
          <Link href="/calendarios" onClick={dismiss}>
            <Button variant="outline" size="sm" className="h-7 text-[11px]">
              Abrir agenda
            </Button>
          </Link>
          <Button size="sm" className="h-7 text-[11px]" onClick={dismiss}>
            Ok
          </Button>
        </span>
      </div>
    </div>
  );
}
