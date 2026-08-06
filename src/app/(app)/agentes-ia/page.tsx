"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Bot } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Agentes de IA"
      icon={Bot}
      tabs={[{ label: "Começando" }, { label: "IA de voz" }, { label: "Conversation AI" }, { label: "Base de Conhecimento" }, { label: "Modelos de agente" }, { label: "Content AI" }, { label: "Logs" }]}
    />
  );
}
