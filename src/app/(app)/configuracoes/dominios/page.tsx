import { Globe } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Não existe gestão de domínios: nenhuma tabela guarda domínios e o CRM não
 * serve sites/funis próprios. Antes esta tela listava três domínios
 * fictícios (crmon.com.br) com SSL "Ativo".
 *
 * O único domínio real do projeto é o de envio de e-mail, verificado no
 * Resend — esse aparece em Configurações → Serviços de e-mail.
 */
export default function DominiosPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Domínios e redirecionamentos</h1>
      <p className="mb-5 text-xs text-slate-500">Domínios conectados a sites, funis e portal do cliente.</p>
      <EmptyState
        icon={Globe}
        title="Gestão de domínios ainda não disponível"
        description="O CRM ainda não hospeda sites ou funis próprios, então não há domínios para conectar aqui. O domínio de envio de e-mail é configurado no Resend e aparece em Serviços de e-mail."
      />
    </div>
  );
}
