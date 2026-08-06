"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Star } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Reputação"
      icon={Star}
      tabs={[{ label: "Visão geral" }, { label: "Solicitações" }, { label: "Avaliações" }, { label: "Depoimentos em vídeo" }, { label: "Widgets" }, { label: "Listagens" }, { label: "Configurações" }]}
    />
  );
}
