"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { WeekCalendar } from "@/components/modules/week-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appointmentActions, useDbAppointments } from "@/lib/data/repos/db/appointments";
import { useDbContacts } from "@/lib/data/repos/db/contacts";
import { contactName } from "@/lib/data/repos/contacts";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visualização de calendário" },
  { label: "Lista de compromissos" },
  { label: "Configurações" },
];

/* -------------------------- Lista de compromissos ------------------------ */

function ListaCompromissos({ onNew }: { onNew: () => void }) {
  const { appointments } = useDbAppointments();
  const { contacts } = useDbContacts();
  const [filtro, setFiltro] = useState<"Futuro" | "Passado">("Futuro");

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Excluir o compromisso "${title}"?`)) return;
    (await appointmentActions.remove(id))
      ? toast.success("Compromisso excluído")
      : toast.error("Não foi possível excluir");
  };

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
        <div className="flex items-center gap-2">
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
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onNew}>
            <Plus className="size-3.5" /> Novo compromisso
          </Button>
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
              <th className="w-10 px-4 py-2.5" />
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
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => remove(a.id, a.title)}
                    className="text-slate-300 hover:text-red-500"
                    title="Excluir compromisso"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
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

/* --------------------------- Novo compromisso ---------------------------- */

function NewAppointmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { contacts } = useDbContacts();
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:45");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!title.trim() || !date || !startTime || !endTime) {
      toast.error("Preencha título, data e horários");
      return;
    }
    if (endTime <= startTime) {
      toast.error("O horário de término precisa ser depois do início");
      return;
    }
    setSaving(true);
    const ok = await appointmentActions.add({
      title: title.trim(),
      contactId: contactId || null,
      start: `${date}T${startTime}:00-03:00`,
      end: `${date}T${endTime}:00-03:00`,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Não foi possível criar o compromisso");
      return;
    }
    toast.success("Compromisso criado");
    setTitle("");
    setContactId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo compromisso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Demo Lito CRM — Maria"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contato (opcional)</Label>
            <Select value={contactId} onValueChange={(v) => setContactId(v ?? "")}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>
                  {contactId
                    ? contactName(contacts.find((c) => c.id === contactId)!)
                    : "Sem contato vinculado"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {contacts.slice(0, 100).map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {contactName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Data *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Início *</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Término *</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={saving}>
            {saving ? "Criando..." : "Criar compromisso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Page --------------------------------- */

export default function CalendariosPage() {
  const [tab, setTab] = useState(TABS[0].label);
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Visualização de calendário" ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Calendários</h1>
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-500">
                  Eventos indigo são do CRM · verdes virão do Google (integração futura)
                </p>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNewOpen(true)}>
                  <Plus className="size-3.5" /> Novo compromisso
                </Button>
              </div>
            </div>
            <WeekCalendar />
          </>
        ) : tab === "Lista de compromissos" ? (
          <ListaCompromissos onNew={() => setNewOpen(true)} />
        ) : (
          <ConfigCalendarios />
        )}
      </div>
      <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
