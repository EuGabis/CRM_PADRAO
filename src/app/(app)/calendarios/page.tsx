"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { CalendarDays } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Calendários"
      icon={CalendarDays}
      tabs={[{ label: "Visualização de calendário" }, { label: "Lista de compromissos" }, { label: "Configurações" }]}
    />
  );
}
