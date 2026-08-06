"use client";

import { CreditCard, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const INVOICES = [
  { id: "FAT-2026-008", period: "Agosto/2026", value: "R$ 297,00", status: "Paga" },
  { id: "FAT-2026-007", period: "Julho/2026", value: "R$ 297,00", status: "Paga" },
  { id: "FAT-2026-006", period: "Junho/2026", value: "R$ 297,00", status: "Paga" },
];

export default function FaturamentoPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Faturamento</h1>
      <p className="mb-5 text-xs text-slate-500">Plano, método de pagamento e histórico de faturas.</p>

      <div className="mb-4 flex items-center justify-between rounded-xl border bg-white p-5">
        <div>
          <p className="text-sm font-bold text-slate-800">
            Plano Ilimitado <Badge className="ml-1 bg-emerald-100 text-emerald-700">Ativo</Badge>
          </p>
          <p className="text-xs text-slate-500">
            R$ 297/mês · usuários, contatos, pipelines e automações ilimitados
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Mudança de plano chega com o backend")}>
          Mudar plano
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <CreditCard className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Cartão •••• 4242</p>
            <p className="text-[11px] text-slate-500">Vence em 09/2028</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Alteração do método de pagamento chega com o backend")}>
          Alterar
        </Button>
      </div>

      <div className="rounded-xl border bg-white">
        <p className="border-b px-4 py-2.5 text-sm font-semibold text-slate-700">Faturas</p>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Fatura", "Período", "Valor", "Status", ""].map((h, i) => (
                <th key={i} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVOICES.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{f.id}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.period}</td>
                <td className="px-4 py-2.5">{f.value}</td>
                <td className="px-4 py-2.5">
                  <Badge className="bg-emerald-100 text-emerald-700">{f.status}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toast.info("Download de faturas chega com o backend")}
                    className="flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <Download className="size-3" /> Baixar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
