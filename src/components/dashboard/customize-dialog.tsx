"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbPipelines } from "@/lib/data/repos/db/pipeline";
import { useMyMembership } from "@/lib/data/repos/db/team";
import { WIDGETS, type WidgetConfig, type WidgetKey } from "./widget-catalog";
import { cn } from "@/lib/utils";

/**
 * Escolhe QUAIS widgets aparecem, em que ORDEM, e com qual pipeline cada um
 * resume. Sai gravado na visualização (tabela `dashboard_views`).
 *
 * Widget de módulo que a pessoa não enxerga (ex.: Pagamentos para quem não tem
 * a permissão) aparece bloqueado em vez de sumir: some da lista sem explicação
 * viraria "por que o painel dele tem um card que o meu não tem?".
 */
export function CustomizeDialog({
  open,
  onOpenChange,
  widgets,
  onSave,
  readOnly = false,
  readOnlyReason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  widgets: WidgetConfig[];
  onSave: (widgets: WidgetConfig[]) => void;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const pipelines = useDbPipelines();
  const { can } = useMyMembership();
  const [draft, setDraft] = useState<WidgetConfig[]>(widgets);
  // Ao (re)abrir, o rascunho volta a espelhar o painel salvo. Ajuste durante o
  // render em vez de efeito: um setState dentro de useEffect só para copiar
  // prop em estado dispara um render extra a cada abertura.
  const [snapshot, setSnapshot] = useState(widgets);
  if (open && snapshot !== widgets) {
    setSnapshot(widgets);
    setDraft(widgets);
  }

  const indexOf = (key: WidgetKey) => draft.findIndex((w) => w.key === key);

  const toggle = (key: WidgetKey) => {
    const i = indexOf(key);
    if (i >= 0) setDraft(draft.filter((w) => w.key !== key));
    else {
      const meta = WIDGETS.find((w) => w.key === key);
      setDraft([
        ...draft,
        { key, pipelineId: meta?.pipeline ? (key === "funil" || key === "distribuicao-fases" ? "" : "all") : undefined },
      ]);
    }
  };

  const move = (key: WidgetKey, dir: -1 | 1) => {
    const i = indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  const setPipeline = (key: WidgetKey, pipelineId: string) =>
    setDraft(draft.map((w) => (w.key === key ? { ...w, pipelineId } : w)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Personalizar painel</DialogTitle>
        </DialogHeader>
        {readOnly && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
            {readOnlyReason ?? "Você não pode editar este painel."}
          </p>
        )}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {WIDGETS.map((meta) => {
            const i = indexOf(meta.key);
            const active = i >= 0;
            const blocked = !!meta.requires && !can(meta.requires);
            const config = active ? draft[i] : null;
            return (
              <div
                key={meta.key}
                className={cn(
                  "rounded-lg border p-2.5",
                  active && "border-indigo-200 bg-indigo-50/40",
                  blocked && "opacity-60"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="pt-0.5">
                    <Checkbox
                      checked={active}
                      disabled={blocked || readOnly}
                      onCheckedChange={() => toggle(meta.key)}
                      aria-label={meta.title}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      {meta.title}
                      {blocked && <Lock className="size-3 text-slate-400" />}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {blocked
                        ? `Precisa de acesso ao módulo ${meta.requires}.`
                        : meta.description}
                    </p>
                    {active && meta.pipeline && !readOnly && (
                      <div className="mt-1.5">
                        <Select
                          value={config?.pipelineId ?? ""}
                          onValueChange={(v) => setPipeline(meta.key, v ?? "")}
                        >
                          <SelectTrigger className="h-7 w-[220px] text-[11px]" size="sm">
                            <SelectValue>
                              {config?.pipelineId === "all"
                                ? "Todos os pipelines"
                                : (pipelines.find((p) => p.id === config?.pipelineId)?.name ??
                                  (pipelines[0]?.name ?? "Primeiro pipeline"))}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {/* Funil e distribuição resumem UM pipeline — não
                                existe "somar todos" que faça sentido ali. */}
                            {meta.key !== "funil" && meta.key !== "distribuicao-fases" && (
                              <SelectItem value="all" className="text-xs">
                                Todos os pipelines
                              </SelectItem>
                            )}
                            {pipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {active && !readOnly && (
                    <div className="flex shrink-0 flex-col">
                      <button
                        onClick={() => move(meta.key, -1)}
                        disabled={i === 0}
                        title="Subir"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        onClick={() => move(meta.key, 1)}
                        disabled={i === draft.length - 1}
                        title="Descer"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={readOnly}
            onClick={() => {
              if (draft.length === 0) {
                toast.error("Deixe ao menos um widget no painel");
                return;
              }
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Salvar painel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
