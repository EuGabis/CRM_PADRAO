"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Workflow } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Automações"
      icon={Workflow}
      tabs={[{ label: "Fluxos de trabalho" }, { label: "Configurações globais" }]}
    />
  );
}
