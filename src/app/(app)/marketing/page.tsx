"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Megaphone } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Marketing"
      icon={Megaphone}
      tabs={[{ label: "Planejador Social" }, { label: "E-mails" }, { label: "Trechos" }, { label: "Contadores regressivos" }, { label: "Links de acionamento" }, { label: "Afiliados" }, { label: "Brand Boards" }, { label: "Gerenciador de anúncios" }]}
    />
  );
}
