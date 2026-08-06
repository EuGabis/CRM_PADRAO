"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { WeekCalendar } from "@/components/modules/week-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppointments } from "@/lib/data/repos/appointments";
import { useContacts, contactName } from "@/lib/data/repos/contacts";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visualização de calendário" },
  { label: "Lista de compromissos" },
  { label: "Configurações" },
];

/* -------------------------- Lista de compromissos ------------------------ */

function ListaCompromissos() {
  const appointments = useAppointments();
  const contacts = useContacts();
  const [filtro, setFiltro] = useState<"Futuro" | "Passado">("Futuro");

  const rows = useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, contactName(c)]));
    const now = Date.now();
    return appointments
      .map((a) => ({
        ...a,
        startDate: new Date(a.start),
        contato: a.contactId ? byId.get(a.contactId) ?? "—" : "—",
      }))
      .filter((a) => (filtro === "Futuro" ? a.startDate.getTime() >= now : a.startDate.getTime() < now))
      .sort((a, b) =>
        filtro === "Futuro"
          ? a.startDate.getTime() - b.startDate.getTime()
          : b.startDate.getTime() - a.startDate.getTime()
      );
  }, [appointments, contacts, filtro]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Lista de compromissos</h1>
          <p className="text-xs text-slate-500">
            Todos os agendamentos sincronizados, em formato de lista
          </p>
        </div>
        <div className="flex gap-1">
          {(["Futuro", "Passado"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium",
                filtro === f ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Título</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Data e hora</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Calendário</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Origem</th>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium">Contato</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">
                  {a.title}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                  {format(a.startDate, "EEE, dd 'de' MMM · HH:mm", { locale: ptBR })}
                  {" – "}
                  {format(new Date(a.end), "HH:mm", { locale: ptBR })}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{a.calendar}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Badge
                    variant="secondary"
                    className={cn(
                      a.source === "google"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-100 text-indigo-700"
                    )}
                  >
                    {a.source === "google" ? "Google" : "CRM"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{a.contato}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  Nenhum compromisso {filtro === "Futuro" ? "futuro" : "passado"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------ Configurações ---------------------------- */

const DIAS = [
  { dia: "Seg", horario: "09:00–18:00" },
  { dia: "Ter", horario: "09:00–18:00" },
  { dia: "Qua", horario: "09:00–18:00" },
  { dia: "Qui", horario: "09:00–18:00" },
  { dia: "Sex", horario: "09:00–18:00" },
  { dia: "Sáb", horario: "Indisponível" },
  { dia: "Dom", horario: "Indisponível" },
];

function ConfigCalendarios() {
  const [duracao, setDuracao] = useState("30");
  const [lembrete24h, setLembrete24h] = useState(true);
  const [lembrete10min, setLembrete10min] = useState(true);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">Configurações de calendário</h1>
        <p className="text-xs text-slate-500">
          Conexões, disponibilidade e lembretes automáticos
        </p>
      </div>
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <p className="mb-3 text-xs font-bold text-slate-700">Calendários conectados</p>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                G
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-800">Google Calendar</p>
                <p className="text-[11px] text-slate-500">gustavo@litocrm.com.br</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => toast.info("Gerenciamento da conexão chega com o backend")}
              >
                Gerenciar
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={() => toast.info("Conexão de novos calendários chega com o backend")}
          >
            + Conectar outro calendário
          </Button>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="mb-3 text-xs font-bold text-slate-700">Disponibilidade padrão</p>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((d) => (
              <span
                key={d.dia}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium",
                  d.horario === "Indisponível"
                    ? "bg-slate-100 text-slate-400"
                    : "bg-indigo-50 text-indigo-700"
                )}
              >
                {d.dia} {d.horario === "Indisponível" ? "—" : d.horario}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-1">
            <Label className="text-xs">Duração padrão da reunião</Label>
            <Select value={duracao} onValueChange={(v) => v && setDuracao(v)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue>{duracao} minutos</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {["30", "45", "60"].map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m} minutos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 md:col-span-2">
          <p className="mb-3 text-xs font-bold text-slate-700">Lembretes automáticos</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Lembrete via WhatsApp — 24h antes
                </p>
                <p className="text-[11px] text-slate-500">
                  Envia uma mensagem de confirmação ao contato um dia antes da reunião
                </p>
              </div>
              <Switch checked={lembrete24h} onCheckedChange={(v) => setLembrete24h(!!v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Lembrete via WhatsApp — 10min antes
                </p>
                <p className="text-[11px] text-slate-500">
                  Envia o link e os detalhes da reunião minutos antes do início
                </p>
              </div>
              <Switch checked={lembrete10min} onCheckedChange={(v) => setLembrete10min(!!v)} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => toast.success("Configurações de calendário salvas")}
            >
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- Page --------------------------------- */

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
        ) : tab === "Lista de compromissos" ? (
          <ListaCompromissos />
        ) : (
          <ConfigCalendarios />
        )}
      </div>
    </div>
  );
}
