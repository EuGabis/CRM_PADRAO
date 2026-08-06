"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { CreditCard } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Pagamentos"
      icon={CreditCard}
      tabs={[{ label: "Pagamentos" }, { label: "Faturas e estimativas" }, { label: "Arquivos e contratos" }, { label: "Pedidos" }, { label: "Assinaturas" }, { label: "Links de pagamento" }, { label: "Vendas" }, { label: "Produtos" }, { label: "Cupons" }, { label: "Gift Cards" }, { label: "Configurações" }, { label: "Integrações" }]}
    />
  );
}
