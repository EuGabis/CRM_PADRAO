"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const OBJECTS = [
  { name: "Contato", fields: 14, records: "6.466", type: "Padrão" },
  { name: "Empresa", fields: 8, records: "312", type: "Padrão" },
  { name: "Oportunidade", fields: 11, records: "6.375", type: "Padrão" },
  { name: "Pedido", fields: 9, records: "1.208", type: "Personalizado" },
];

export default function ObjetosPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Objetos</h1>
          <p className="text-xs text-slate-500">Entidades de dados do CRM, padrão e personalizadas.</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Objetos personalizados chegam com o backend")}>
          <Plus className="size-3.5" /> Novo objeto
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Nome", "Campos", "Registros", "Tipo"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OBJECTS.map((o) => (
              <tr key={o.name} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{o.name}</td>
                <td className="px-4 py-2.5">{o.fields}</td>
                <td className="px-4 py-2.5">{o.records}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="secondary"
                    className={o.type === "Personalizado" ? "bg-indigo-100 text-indigo-700" : ""}
                  >
                    {o.type}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
