"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Users } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Contatos"
      icon={Users}
      tabs={[{ label: "Contatos" }, { label: "Listas inteligentes" }, { label: "Ações em massa" }, { label: "Tarefas" }, { label: "Empresas" }, { label: "Configurações" }]}
    />
  );
}
