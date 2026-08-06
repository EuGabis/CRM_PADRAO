"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { GraduationCap } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Assinaturas"
      icon={GraduationCap}
      tabs={[{ label: "Portal do cliente" }, { label: "Cursos" }, { label: "Comunidades" }, { label: "Certificados" }, { label: "Marketplace" }]}
    />
  );
}
