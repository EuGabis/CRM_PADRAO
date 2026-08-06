"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePipelines } from "@/lib/data/repos/opportunities";

export default function LeadsPipelinesConfigPage() {
  const pipelines = usePipelines();
  const [defaultPipe, setDefaultPipe] = useState(pipelines[0]?.id ?? "");
  const [autoOpp, setAutoOpp] = useState(true);

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Leads &amp; Pipelines</h1>
      <p className="mb-5 text-xs text-slate-500">Regras gerais de criação e organização de oportunidades.</p>

      <div className="mb-4 space-y-3 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold">Pipeline padrão</Label>
            <p className="text-[11px] text-slate-500">Novas oportunidades entram neste pipeline</p>
          </div>
          <Select value={defaultPipe} onValueChange={(v) => v && setDefaultPipe(v)}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue>{pipelines.find((p) => p.id === defaultPipe)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-xs font-semibold">Criar oportunidade automaticamente</Label>
            <p className="text-[11px] text-slate-500">
              Todo novo contato gera uma oportunidade na primeira fase
            </p>
          </div>
          <Switch checked={autoOpp} onCheckedChange={(v) => setAutoOpp(!!v)} />
        </div>
      </div>

      {pipelines.map((p) => (
        <div key={p.id} className="mb-3 rounded-xl border bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">{p.name}</p>
            <span className="text-[11px] text-slate-400">{p.stages.length} fases</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.stages
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <span
                  key={s.id}
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                  style={{ background: s.color }}
                >
                  {s.name}
                </span>
              ))}
          </div>
        </div>
      ))}
      <Button size="sm" className="text-xs" onClick={() => toast.success("Regras salvas (sessão)")}>
        Salvar
      </Button>
    </div>
  );
}
