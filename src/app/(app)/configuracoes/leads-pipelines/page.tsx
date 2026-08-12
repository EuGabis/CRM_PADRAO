"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
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
import { usePipelineDb } from "@/lib/data/repos/db/pipeline";

/**
 * Pipelines/fases vêm do banco (usePipelineDb) — antes esta tela lia
 * `usePipelines` do store mock, então mostrava os pipelines das fixtures em
 * vez dos que a empresa realmente tem.
 *
 * "Pipeline padrão" e "criar oportunidade automaticamente" ainda não têm
 * onde persistir (nenhuma coluna em locations/location_members guarda isso),
 * então seguem a convenção do projeto: toast.info avisando que a ação
 * depende do backend, em vez de um "salvo" que não salva nada.
 */
export default function LeadsPipelinesConfigPage() {
  const { pipelines, loaded } = usePipelineDb();
  const [defaultPipe, setDefaultPipe] = useState("");
  const [autoOpp, setAutoOpp] = useState(false);

  // Os pipelines chegam via fetch — o valor inicial do select só existe
  // depois que a carga termina.
  useEffect(() => {
    if (!defaultPipe && pipelines.length > 0) setDefaultPipe(pipelines[0].id);
  }, [pipelines, defaultPipe]);

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando...
      </div>
    );
  }

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
              <SelectValue>{pipelines.find((p) => p.id === defaultPipe)?.name ?? "—"}</SelectValue>
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
        <Button
          size="sm"
          className="text-xs"
          onClick={() => toast.info("Preferências de pipeline chegam com o backend")}
        >
          Salvar
        </Button>
      </div>

      {pipelines.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center text-xs text-slate-400">
          Nenhum pipeline cadastrado ainda.
        </div>
      ) : (
        pipelines.map((p) => (
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
        ))
      )}

      <Link
        href="/leads"
        className="flex items-center justify-between rounded-xl border bg-white p-4 text-xs hover:border-indigo-300"
      >
        <span className="font-medium text-slate-700">
          Criar, renomear e reordenar pipelines e fases no módulo Leads
        </span>
        <ArrowRight className="size-4 text-slate-400" />
      </Link>
    </div>
  );
}
