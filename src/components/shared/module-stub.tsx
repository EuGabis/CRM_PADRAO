"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { SubNav, type SubNavTab } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { brand } from "@/lib/config/brand";

export function ModuleStub({
  title,
  icon,
  tabs,
  description,
}: {
  title: string;
  icon: LucideIcon;
  tabs?: SubNavTab[];
  description?: string;
}) {
  const [active, setActive] = useState(tabs?.[0]?.label ?? "");
  return (
    <div>
      {tabs && tabs.length > 0 && <SubNav tabs={tabs} active={active} onChange={setActive} />}
      <div className="p-6">
        <h1 className="mb-4 text-lg font-bold text-slate-900">{title}</h1>
        <EmptyState
          icon={icon}
          title={active ? `${active} — em construção` : "Em construção"}
          description={
            description ??
            `Este módulo faz parte do ${brand.name} e será aprofundado nas próximas etapas.`
          }
        />
      </div>
    </div>
  );
}
