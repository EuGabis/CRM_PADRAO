"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const FIELDS = [
  { name: "Tipo de Negócio", object: "Contato", type: "Dropdown" },
  { name: "Interesse com CRM", object: "Contato", type: "Dropdown" },
  { name: "Fonte UTM", object: "Contato", type: "Texto" },
  { name: "utm_campaign", object: "Contato", type: "Texto" },
  { name: "Data de renovação", object: "Oportunidade", type: "Data" },
  { name: "Nº de funcionários", object: "Empresa", type: "Número" },
];

export default function CamposPage() {
  const [active, setActive] = useState<boolean[]>(FIELDS.map(() => true));

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Campos personalizados</h1>
          <p className="text-xs text-slate-500">Campos extras exibidos nas fichas de contato, empresa e oportunidade.</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de campos chega com o backend")}>
          <Plus className="size-3.5" /> Novo campo
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Nome", "Objeto", "Tipo", "Ativo"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f, i) => (
              <tr key={f.name} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{f.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.object}</td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary">{f.type}</Badge>
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
