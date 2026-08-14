"use client";

import { useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbPipelines } from "@/lib/data/repos/db/pipeline";

/**
 * Pipeline do widget: controlado pela visualização salva quando ela existe,
 * local quando o widget é usado solto. Sem isso, escolher o pipeline do funil
 * seria esquecido a cada recarregamento — que é justamente o que se quer
 * guardar num painel personalizado.
 */
export interface WidgetPipelineProps {
  pipelineId?: string;
  onPipelineChange?: (id: string) => void;
}

export function usePipelineSelection(
  { pipelineId, onPipelineChange }: WidgetPipelineProps,
  fallback: string
): [string, (id: string) => void] {
  const [local, setLocal] = useState(pipelineId ?? fallback);
  // Controlado SÓ quando há para onde gravar. Sem o handler (painel de fábrica,
  // ou painel do departamento aberto por quem não edita) o seletor volta a ser
  // local — senão ficaria travado no valor salvo, sem reagir ao clique.
  const value = onPipelineChange ? (pipelineId ?? fallback) : local;
  return [
    value,
    (id: string) => {
      if (onPipelineChange) onPipelineChange(id);
      else setLocal(id);
    },
  ];
}

export function WidgetCard({
  title,
  children,
  pipelineId,
  onPipelineChange,
  footer,
}: {
  title: string;
  children: ReactNode;
  pipelineId?: string;
  onPipelineChange?: (id: string) => void;
  footer?: ReactNode;
}) {
  const pipelines = useDbPipelines();
  return (
    <div className="flex flex-col rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-slate-700">{title}</h3>
        <div className="flex items-center gap-1.5">
          {onPipelineChange && (
            <Select value={pipelineId} onValueChange={(v) => v && onPipelineChange(v)}>
              <SelectTrigger className="h-7 w-[150px] text-[11px]" size="sm">
                <SelectValue>
                  {pipelineId === "all" || !pipelineId
                    ? "Todos os pipelines"
                    : (pipelines.find((p) => p.id === pipelineId)?.name ??
                      "Todos os pipelines")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos os pipelines
                </SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* A engrenagem que ficava aqui não tinha ação nenhuma: clicar não
              abria nada. Volta quando existir configuração de widget. */}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {footer}
    </div>
  );
}
