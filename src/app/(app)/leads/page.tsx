"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { KanbanSquare } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Leads"
      icon={KanbanSquare}
      tabs={[{ label: "Leads" }, { label: "Pipelines" }, { label: "Ações em massa" }]}
    />
  );
}
