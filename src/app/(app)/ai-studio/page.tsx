"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Sparkles } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="AI Studio"
      icon={Sparkles}
      tabs={[{ label: "Começando" }, { label: "IA de voz" }, { label: "Conversation AI" }, { label: "Base de Conhecimento" }, { label: "Modelos de agente" }, { label: "Content AI" }, { label: "Logs" }]}
    />
  );
}
