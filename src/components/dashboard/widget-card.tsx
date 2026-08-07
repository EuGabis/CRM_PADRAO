"use client";

import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbPipelines } from "@/lib/data/repos/db/pipeline";

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
          <button className="text-slate-400 hover:text-slate-600">
            <Settings2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {footer}
    </div>
  );
}
