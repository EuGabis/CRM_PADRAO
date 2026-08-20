import type { Appointment } from "../types";

// semana de 2026-08-02 (dom) a 2026-08-08 (sáb)
export const appointments: Appointment[] = [
  { id: "ap-1", contactId: "c-1", title: "Demo CRM ON — Maurício", start: "2026-08-03T10:00:00-03:00", end: "2026-08-03T10:45:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-2", contactId: null, title: "Ocupado", start: "2026-08-03T13:00:00-03:00", end: "2026-08-03T14:00:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
  { id: "ap-3", contactId: "c-4", title: "Onboarding — Thiago (Linx)", start: "2026-08-04T09:30:00-03:00", end: "2026-08-04T10:15:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-4", contactId: null, title: "Ocupado", start: "2026-08-04T15:00:00-03:00", end: "2026-08-04T16:30:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
  { id: "ap-5", contactId: "c-9", title: "Call de fechamento — Eduarda", start: "2026-08-05T11:00:00-03:00", end: "2026-08-05T11:35:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-6", contactId: null, title: "Intervalo bloqueado", start: "2026-08-05T12:00:00-03:00", end: "2026-08-05T13:00:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
  { id: "ap-7", contactId: "c-12", title: "Demo CRM ON — Hugo", start: "2026-08-05T16:00:00-03:00", end: "2026-08-05T16:45:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-8", contactId: null, title: "Ocupado", start: "2026-08-06T09:00:00-03:00", end: "2026-08-06T10:00:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
  { id: "ap-9", contactId: "c-17", title: "Follow-up — Mariana", start: "2026-08-06T14:00:00-03:00", end: "2026-08-06T14:30:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-10", contactId: null, title: "Ocupado", start: "2026-08-07T10:30:00-03:00", end: "2026-08-07T12:00:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
  { id: "ap-11", contactId: "c-21", title: "Treinamento equipe — Quésia", start: "2026-08-07T15:00:00-03:00", end: "2026-08-07T16:00:00-03:00", calendar: "Reuniões", source: "crm", kind: "compromisso", done: false },
  { id: "ap-12", contactId: null, title: "Evento recorrente", start: "2026-08-08T09:00:00-03:00", end: "2026-08-08T09:30:00-03:00", calendar: "Reuniões", source: "google", kind: "compromisso", done: false },
];
