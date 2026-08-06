"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DOMAINS = [
  { domain: "www.litocrm.com.br", type: "Site", status: "Ativo" },
  { domain: "lancamento.litocrm.com.br", type: "Funil", status: "Ativo" },
  { domain: "clientes.litocrm.com.br", type: "Portal", status: "Propagando" },
];

export default function DominiosPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Domínios e redirecionamentos</h1>
          <p className="text-xs text-slate-500">Domínios conectados a sites, funis e portal do cliente.</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Conexão de domínios chega com o backend")}>
          <Plus className="size-3.5" /> Conectar domínio
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Domínio", "Tipo", "SSL", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d.domain} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{d.domain}</td>
                <td className="px-4 py-2.5 text-slate-500">{d.type}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <ShieldCheck className="size-3.5" /> Ativo
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="secondary"
                    className={d.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}
                  >
                    {d.status}
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
