"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const RULES = [
  { rule: "Respondeu em menos de 1 hora", points: 10 },
  { rule: "Abriu e-mail de campanha", points: 5 },
  { rule: "Clicou em link de oferta", points: 8 },
  { rule: "Compromisso agendado", points: 15 },
  { rule: "Sem resposta há 7 dias", points: -10 },
  { rule: "DND ativado", points: -20 },
];

export default function PontuacaoPage() {
  const [active, setActive] = useState<boolean[]>(RULES.map(() => true));

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Pontuação de leads</h1>
          <p className="text-xs text-slate-500">
            Regras de lead scoring para priorizar quem está mais quente.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de regras chega com o backend")}>
          <Plus className="size-3.5" /> Nova regra
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Regra", "Pontos", "Ativa"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RULES.map((r, i) => (
              <tr key={r.rule} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.rule}</td>
                <td className={cn("px-4 py-2.5 font-bold", r.points >= 0 ? "text-emerald-600" : "text-red-500")}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </td>
                <td className="px-4 py-2.5">
                  <Switch
                    checked={active[i]}
                    onCheckedChange={(v) =>
                      setActive((arr) => arr.map((x, xi) => (xi === i ? !!v : x)))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
