import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-semibold",
            delta >= 0 ? "text-emerald-600" : "text-red-500"
          )}
        >
          {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {Math.abs(delta).toLocaleString("pt-BR")}% vs mês anterior
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
