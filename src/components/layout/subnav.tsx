"use client";

import { cn } from "@/lib/utils";

export interface SubNavTab {
  label: string;
  key?: string;
}

export function SubNav({
  tabs,
  active,
  onChange,
}: {
  tabs: SubNavTab[];
  active: string;
  onChange?: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-white px-4 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const key = tab.key ?? tab.label;
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange?.(key)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
