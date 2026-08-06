"use client";

import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const IMPORTS = [
  { file: "Export_Contacts_Julho.csv", records: "4.812", status: "Concluída", date: "12 jul 2026" },
  { file: "leads-evento-feira.csv", records: "1.204", status: "Concluída", date: "28 jun 2026" },
];

export default function ImportarPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Importar dados</h1>
      <p className="mb-5 text-xs text-slate-500">
        Traga contatos e oportunidades de outras plataformas via CSV (até 50 mil registros por
        arquivo).
      </p>
      <button
        onClick={() => toast.info("Importação CSV chega com o backend")}
        className="mb-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-10 text-indigo-600 hover:bg-indigo-50"
      >
        <UploadCloud className="size-8" />
        <span className="text-sm font-semibold">Arraste um CSV aqui ou clique para escolher</span>
        <span className="text-[11px] text-indigo-400">Mapeamento de colunas na próxima etapa</span>
      </button>
      <div className="rounded-xl border bg-white">
        <p className="border-b px-4 py-2.5 text-sm font-semibold text-slate-700">
          Importações anteriores
        </p>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Arquivo", "Registros", "Status", "Data"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {IMPORTS.map((i) => (
              <tr key={i.file} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{i.file}</td>
                <td className="px-4 py-2.5">{i.records}</td>
                <td className="px-4 py-2.5">
                  <Badge className="bg-emerald-100 text-emerald-700">{i.status}</Badge>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{i.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
