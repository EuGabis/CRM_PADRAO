import Link from "next/link";
import { Boxes } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Objetos personalizados não existem no schema — o CRM tem entidades fixas
 * (contatos, oportunidades, compromissos...). Antes esta tela mostrava uma
 * tabela com contagens inventadas ("Contato — 6.466 registros", um objeto
 * "Pedido" que nunca existiu).
 */
export default function ObjetosPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Objetos</h1>
      <p className="mb-5 text-xs text-slate-500">Entidades de dados do CRM.</p>
      <EmptyState
        icon={Boxes}
        title="Objetos personalizados ainda não disponíveis"
        description="O CRM trabalha hoje com entidades fixas (contatos, empresas, oportunidades, compromissos). Para guardar informação extra, use campos personalizados nos contatos."
        cta={
          <Link
            href="/configuracoes/campos"
            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
          >
            Ir para campos personalizados
          </Link>
        }
      />
    </div>
  );
}
