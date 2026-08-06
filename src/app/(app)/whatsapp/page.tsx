"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { MessageCircle } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="WhatsApp"
      icon={MessageCircle}
      tabs={[{ label: "API Não Oficial" }, { label: "API Oficial" }]}
    />
  );
}
