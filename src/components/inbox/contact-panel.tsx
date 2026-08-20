"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  FileText,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SendToPipelineDialog } from "./send-to-pipeline-dialog";
import { contactName } from "@/lib/data/repos/contacts";
import { useDbContact, useDbStore, useDbTeam } from "@/lib/data/repos/db/contacts";
import { usePipelineDb } from "@/lib/data/repos/db/pipeline";
import { formatBRL } from "@/lib/data/repos/opportunities";
import { useContactNotes, contactNoteActions } from "@/lib/data/repos/db/contact-notes";
import {
  appointmentActions,
  useContactAppointments,
} from "@/lib/data/repos/db/appointments";
import { cn } from "@/lib/utils";

/** Valor do item "sem lembrete" do select — mesmo padrão de calendarios/page.tsx. */
const NO_REMINDER = "__none__";

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: NO_REMINDER, label: "Sem lembrete" },
  { value: "5", label: "5 minutos antes" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 dia antes" },
];

type Panel = "campos" | "tarefas" | "notas" | "compromissos" | "arquivos";

const PANELS: { key: Panel; icon: typeof User; label: string }[] = [
  { key: "campos", icon: User, label: "Contato" },
  { key: "tarefas", icon: CheckSquare, label: "Tarefas" },
  { key: "notas", icon: Pencil, label: "Observações" },
  { key: "compromissos", icon: CalendarDays, label: "Compromissos" },
  { key: "arquivos", icon: FileText, label: "Arquivos" },
];

function PanelShell({
  title,
  children,
  searchPlaceholder,
}: {
  title: string;
  children: React.ReactNode;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        <button
          onClick={() => toast.info(`Adicionar em "${title}" chega com o backend`)}
          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
        >
          <Plus className="size-3" /> Adicionar
        </button>
      </div>
      {searchPlaceholder && (
        <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
          <Search className="size-3 text-slate-400" />
          <Input
            placeholder={searchPlaceholder}
            className="h-6 border-0 p-0 text-[11px] shadow-none focus-visible:ring-0"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">{children}</div>
    </div>
  );
}

function NotesPanel({ contactId }: { contactId: string }) {
  const { notes, loading } = useContactNotes(contactId);
  const team = useDbTeam();
  const userId = useDbStore((s) => s.userId);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const authorName = (createdBy: string | null) => {
    if (!createdBy) return null;
    if (createdBy === userId) return "Você";
    return team.find((u) => u.id === createdBy)?.name ?? null;
  };

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    const ok = await contactNoteActions.add(contactId, body);
    setSaving(false);
    if (!ok) {
      // Nunca some com o texto digitado: mantém o draft pra tentar de novo.
      toast.error("Não foi possível salvar a observação. Tente novamente.");
      return;
    }
    setDraft("");
    toast.success("Observação adicionada.");
  };

  const handleRemove = async (id: string) => {
    const ok = await contactNoteActions.remove(id);
    if (!ok) {
      toast.error("Não foi possível apagar a observação.");
      return;
    }
    toast.success("Observação removida.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma observação sobre este contato..."
          className="min-h-16 resize-none text-xs"
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim() || saving}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar observação
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {loading ? (
          <p className="text-[11px] text-slate-400">Carregando...</p>
        ) : notes.length === 0 ? (
          <SmallEmpty
            icon={Pencil}
            title="Ainda não há observações"
            text="Adicione a primeira observação sobre este lead."
          />
        ) : (
          <div className="space-y-2">
            {notes.map((n) => {
              const author = authorName(n.createdBy);
              return (
                <div key={n.id} className="group rounded-lg border p-2.5">
                  <p className="whitespace-pre-wrap text-xs text-slate-700">{n.body}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-400">
                      {author ? `${author} · ` : ""}
                      {format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <button
                      onClick={() => handleRemove(n.id)}
                      className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                      title="Apagar observação"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compromissos e tarefas são a MESMA tabela (`appointments`), distinguidos
 * por `kind` (migração 0063) — os dois painéis abaixo só variam nisso e em
 * ter (ou não) checkbox de concluída. */
function CompromissosPanel({ contactId }: { contactId: string }) {
  const { appointments, loading } = useContactAppointments(contactId, "compromisso");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reminder, setReminder] = useState<string>(NO_REMINDER);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim() || !date || !startTime || !endTime || saving) {
      toast.error("Preencha título, data e horários");
      return;
    }
    if (endTime <= startTime) {
      toast.error("O horário de término precisa ser depois do início");
      return;
    }
    setSaving(true);
    const ok = await appointmentActions.add({
      contactId,
      kind: "compromisso",
      title: title.trim(),
      start: `${date}T${startTime}:00-03:00`,
      end: `${date}T${endTime}:00-03:00`,
      reminderMinutes: reminder === NO_REMINDER ? null : Number(reminder),
    });
    setSaving(false);
    if (!ok) {
      toast.error("Não foi possível criar o compromisso");
      return;
    }
    setTitle("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setReminder(NO_REMINDER);
    toast.success("Compromisso criado");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-bold text-slate-700">Compromissos</h3>
      </div>
      <div className="space-y-1.5 border-b p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do compromisso"
          className="h-7 text-xs"
        />
        <div className="flex gap-1.5">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 flex-1 text-[11px]"
          />
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-7 w-20 text-[11px]"
          />
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-7 w-20 text-[11px]"
          />
        </div>
        <Select value={reminder} onValueChange={(v) => v && setReminder(v)}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue>
              {REMINDER_OPTIONS.find((r) => r.value === reminder)?.label ?? "Sem lembrete"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {REMINDER_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar compromisso
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {loading ? (
          <p className="text-[11px] text-slate-400">Carregando...</p>
        ) : appointments.length === 0 ? (
          <SmallEmpty
            icon={CalendarDays}
            title="Ainda não há compromissos"
            text="Dê início ao processo agendando o primeiro compromisso."
          />
        ) : (
          <div className="space-y-2">
            {appointments.map((a) => (
              <div key={a.id} className="rounded-lg border p-2.5">
                <p className="text-xs font-semibold text-slate-700">{a.title}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {format(new Date(a.start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TarefasPanel({ contactId }: { contactId: string }) {
  const { appointments, loading } = useContactAppointments(contactId, "tarefa");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reminder, setReminder] = useState<string>(NO_REMINDER);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim() || !date || !time || saving) {
      toast.error("Preencha título e data/hora");
      return;
    }
    setSaving(true);
    // `ends_at` é NOT NULL na tabela; tarefa é um ponto no tempo, então o
    // fim repete o início quando não há um informado separadamente.
    const start = `${date}T${time}:00-03:00`;
    const ok = await appointmentActions.add({
      contactId,
      kind: "tarefa",
      title: title.trim(),
      start,
      end: start,
      reminderMinutes: reminder === NO_REMINDER ? null : Number(reminder),
    });
    setSaving(false);
    if (!ok) {
      toast.error("Não foi possível criar a tarefa");
      return;
    }
    setTitle("");
    setDate("");
    setTime("");
    setReminder(NO_REMINDER);
    toast.success("Tarefa criada");
  };

  const handleToggle = async (id: string, done: boolean) => {
    const ok = await appointmentActions.toggleDone(id, done);
    if (!ok) toast.error("Não foi possível atualizar a tarefa");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-bold text-slate-700">Tarefas</h3>
      </div>
      <div className="space-y-1.5 border-b p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da tarefa"
          className="h-7 text-xs"
        />
        <div className="flex gap-1.5">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 flex-1 text-[11px]"
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-7 w-20 text-[11px]"
          />
        </div>
        <Select value={reminder} onValueChange={(v) => v && setReminder(v)}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue>
              {REMINDER_OPTIONS.find((r) => r.value === reminder)?.label ?? "Sem lembrete"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {REMINDER_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar tarefa
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {loading ? (
          <p className="text-[11px] text-slate-400">Carregando...</p>
        ) : appointments.length === 0 ? (
          <SmallEmpty
            icon={CheckSquare}
            title="Ainda não há tarefas"
            text="Mantenha a organização criando sua primeira tarefa."
          />
        ) : (
          <div className="space-y-2">
            {appointments.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5"
              >
                <input
                  type="checkbox"
                  checked={a.done}
                  onChange={(e) => handleToggle(a.id, e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-indigo-600"
                />
                <span className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs font-semibold text-slate-700",
                      a.done && "text-slate-400 line-through"
                    )}
                  >
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {format(new Date(a.start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SmallEmpty({ icon, title, text }: { icon: typeof User; title: string; text: string }) {
  const Icon = icon;
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 text-center">
      <Icon className="size-6 text-slate-300" />
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="text-[11px] text-slate-400">{text}</p>
    </div>
  );
}

export function ContactPanel({ contactId }: { contactId: string }) {
  const [panel, setPanel] = useState<Panel>("campos");
  const [tab, setTab] = useState<"todos" | "dnd" | "acoes">("todos");
  const [fileTab, setFileTab] = useState("Todos");
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const { contact } = useDbContact(contactId);
  const { pipelines, opportunities: allOpps } = usePipelineDb();
  const opportunities = allOpps.filter((o) => o.contactId === contactId);

  if (!contact) return null;

  return (
    <div className="hidden w-[340px] shrink-0 border-l bg-white xl:flex">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {panel === "campos" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2">
              <p className="text-xs font-bold text-slate-700">{contactName(contact)}</p>
              <Link
                href={`/contatos/${contact.id}`}
                className="text-[10px] text-indigo-600 hover:underline"
              >
                Ver contato completo
              </Link>
              {/* Botão E situação no funil ficam no cabeçalho, e não dentro da
                  aba "Ações": saber que o contato JÁ está num pipeline é a
                  informação que evita mandar o mesmo lead duas vezes — não
                  pode depender de trocar de aba pra aparecer. */}
              <button
                onClick={() => setPipelineOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Target className="size-3" /> Enviar para pipeline
              </button>
              {opportunities.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {opportunities.length === 1 ? "No pipeline" : "Nos pipelines"}
                  </p>
                  {opportunities.map((o) => {
                    const pipeline = pipelines.find((p) => p.id === o.pipelineId);
                    const stage = pipeline?.stages.find((s) => s.id === o.stageId);
                    return (
                      <Link
                        key={o.id}
                        href={`/leads?pipeline=${o.pipelineId}`}
                        title="Abrir no funil de Leads"
                        className="flex items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 hover:border-indigo-300 hover:bg-slate-50"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold text-slate-700">
                            {pipeline?.name ?? "Pipeline"}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {stage?.name ?? "—"}
                            {o.status === "won"
                              ? " · Ganho"
                              : o.status === "lost"
                                ? " · Perdido"
                                : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-600">
                          {formatBRL(o.value)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-1 border-b px-2 py-1.5">
              {(
                [
                  ["todos", "Todos os campos"],
                  ["dnd", "DND"],
                  ["acoes", "Ações"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium",
                    tab === key ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
              {tab === "todos" && (
                <Accordion defaultValue={["contato", "custom"]}>
                  <AccordionItem value="contato">
                    <AccordionTrigger className="py-2 text-xs font-bold">Contato</AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {[
                        ["Nome", contact.firstName],
                        ["Sobrenome", contact.lastName],
                        ["E-mail", contact.email],
                        ["Telefone", contact.phone],
                        ["Empresa", contact.company ?? "—"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[10px] text-slate-400">{k}</p>
                          <p className="truncate text-xs text-slate-700">{v}</p>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="custom">
                    <AccordionTrigger className="py-2 text-xs font-bold">
                      Campos personalizados
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {Object.entries(contact.customFields).map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[10px] text-slate-400">{k}</p>
                          <p className="truncate text-xs text-slate-700">{v}</p>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
              {tab === "dnd" && (
                <div className="space-y-2 text-xs text-slate-600">
                  <p className="font-semibold">Não Perturbe (DND)</p>
                  <p className="text-[11px] text-slate-400">
                    {contact.dnd
                      ? "Este contato optou por não receber comunicações."
                      : "Este contato aceita receber comunicações em todos os canais."}
                  </p>
                  <Badge variant={contact.dnd ? "destructive" : "secondary"}>
                    {contact.dnd ? "DND ativado" : "DND desativado"}
                  </Badge>
                </div>
              )}
              {tab === "acoes" && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Oportunidades
                  </p>
                  {opportunities.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      Nenhuma oportunidade — use “Enviar para pipeline” acima.
                    </p>
                  )}
                  {opportunities.map((o) => {
                    const pipeline = pipelines.find((p) => p.id === o.pipelineId);
                    const stage = pipeline?.stages.find((s) => s.id === o.stageId);
                    return (
                      <div key={o.id} className="rounded-lg border p-2.5">
                        <p className="text-[10px] font-semibold text-slate-500">
                          {pipeline?.name} &gt; {stage?.name}
                        </p>
                        <div className="mt-0.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-800">{o.name}</span>
                          <span className="text-xs font-bold">{formatBRL(o.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Fluxos de trabalho ativos
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Boas-vindas | Novo Lead · Follow-up 3 dias
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : panel === "tarefas" ? (
          <TarefasPanel contactId={contactId} />
        ) : panel === "notas" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2">
              <h3 className="text-xs font-bold text-slate-700">Observações</h3>
            </div>
            <NotesPanel contactId={contactId} />
          </div>
        ) : panel === "compromissos" ? (
          <CompromissosPanel contactId={contactId} />
        ) : (
          <PanelShell title="Arquivos" searchPlaceholder="Pesquisar por documento">
            <div className="mb-2 flex gap-1">
              {["Todos", "Interno", "Enviado", "Recebido"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFileTab(t)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    fileTab === t ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <SmallEmpty
              icon={FileText}
              title="Ainda não há documentos"
              text="Carregue ou envie documentos para vê-los aqui."
            />
          </PanelShell>
        )}
      </div>
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-l py-2">
        {PANELS.map(({ key, icon: Icon, label }) => (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <button
                  onClick={() => setPanel(key)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md",
                    panel === key
                      ? "bg-indigo-100 text-indigo-600"
                      : "text-slate-400 hover:bg-slate-100"
                  )}
                />
              }
            >
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="left" className="text-[10px]">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <SendToPipelineDialog
        open={pipelineOpen}
        onOpenChange={setPipelineOpen}
        contactId={contact.id}
        contactName={contactName(contact)}
      />
    </div>
  );
}
