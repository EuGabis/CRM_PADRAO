"use client";

import { ModuleStub } from "@/components/shared/module-stub";
import { Globe } from "lucide-react";

export default function Page() {
  return (
    <ModuleStub
      title="Sites"
      icon={Globe}
      tabs={[{ label: "Funis" }, { label: "Sites" }, { label: "Lojas" }, { label: "Webinars" }, { label: "Analytics" }, { label: "Blogs" }, { label: "WordPress" }, { label: "Portal do cliente" }, { label: "Formulários" }, { label: "Pesquisas" }, { label: "Testes" }, { label: "Widget de chat" }, { label: "Códigos QR" }]}
    />
  );
}
