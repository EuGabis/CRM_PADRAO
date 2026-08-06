"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { BarChart3 } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Relatórios"
      icon={BarChart3}
      tabs={[{ label: "Relatórios personalizados" }, { label: "Google Ads" }, { label: "Anúncios Meta" }, { label: "Atribuição" }, { label: "Ligações" }, { label: "Agentes" }, { label: "Compromissos" }]}
    />
  );
}
