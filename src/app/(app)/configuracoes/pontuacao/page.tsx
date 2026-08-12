import { Target } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Lead scoring não existe: não há coluna de pontuação em contacts nem
 * nenhuma regra sendo avaliada. Antes esta tela mostrava seis regras
 * inventadas com switches que não faziam nada.
 */
export default function PontuacaoPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Pontuação de leads</h1>
      <p className="mb-5 text-xs text-slate-500">
        Regras de lead scoring para priorizar quem está mais quente.
      </p>
      <EmptyState
        icon={Target}
        title="Pontuação de leads ainda não disponível"
        description="Nenhuma regra de pontuação está sendo aplicada aos contatos. Para priorizar contatos hoje, use tags e listas inteligentes no módulo Contatos."
      />
    </div>
  );
}
