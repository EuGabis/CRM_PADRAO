"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { MessageSquare } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Conversas"
      icon={MessageSquare}
      tabs={[{ label: "Conversas" }, { label: "Ações manuais" }, { label: "Trechos" }, { label: "Links de acionamento" }, { label: "Estatísticas" }, { label: "Configurações" }]}
    />
  );
}
