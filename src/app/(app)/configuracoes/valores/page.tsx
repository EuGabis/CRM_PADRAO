"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const VALUES = [
  { name: "{{empresa.nome}}", value: "Lito Comercial", used: 12 },
  { name: "{{empresa.telefone}}", value: "+55 21 3828-0872", used: 8 },
  { name: "{{link.agendamento}}", value: "lito.link/demo", used: 15 },
  { name: "{{oferta.desconto}}", value: "70% OFF", used: 5 },
];

export default function ValoresPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Valores personalizados</h1>
          <p className="text-xs text-slate-500">
            Variáveis reutilizáveis em mensagens, e-mails e automações.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de valores chega com o backend")}>
          <Plus className="size-3.5" /> Novo valor
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Nome", "Valor atual", "Em uso"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VALUES.map((v) => (
              <tr key={v.name} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-[11px] text-indigo-700">{v.name}</td>
                <td className="px-4 py-2.5 text-slate-700">{v.value}</td>
                <td className="px-4 py-2.5 text-slate-500">{v.used} automações</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
