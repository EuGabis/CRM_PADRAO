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
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { SendToPipelineDialog } from "./send-to-pipeline-dialog";
import { contactName } from "@/lib/data/repos/contacts";
import { useDbContact } from "@/lib/data/repos/db/contacts";
import { usePipelineDb } from "@/lib/data/repos/db/pipeline";
import { formatBRL } from "@/lib/data/repos/opportunities";
import { cn } from "@/lib/utils";

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
              {/* Fica no cabeçalho, e não dentro da aba "Ações", pra estar
                  visível em qualquer aba do painel. */}
              <button
                onClick={() => setPipelineOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Target className="size-3" /> Enviar para pipeline
              </button>
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
          <PanelShell title="Tarefas" searchPlaceholder="Pesquisar por título">
            <SmallEmpty
              icon={CheckSquare}
              title="Ainda não há tarefas"
              text="Mantenha a organização criando sua primeira tarefa."
            />
          </PanelShell>
        ) : panel === "notas" ? (
          <PanelShell title="Observações" searchPlaceholder="Pesquisar notas">
            <SmallEmpty
              icon={Pencil}
              title="Ainda não há observações"
              text="Adicione a primeira observação sobre este lead."
            />
          </PanelShell>
        ) : panel === "compromissos" ? (
          <PanelShell title="Compromissos" searchPlaceholder="Pesquisar por calendário">
            <SmallEmpty
              icon={CalendarDays}
              title="Ainda não há compromissos"
              text="Dê início ao processo agendando o primeiro compromisso."
            />
          </PanelShell>
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
