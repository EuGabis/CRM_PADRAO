"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OpportunityCard } from "./opportunity-card";
import { formatBRL, stageTotal } from "@/lib/data/repos/opportunities";
import type { Opportunity, Stage, User } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function StageColumn({
  stage,
  opportunities,
  users,
}: {
  stage: Stage;
  opportunities: Opportunity[];
  users: User[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex h-full w-10 shrink-0 flex-col items-center gap-2 rounded-lg border bg-white py-3"
        style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
      >
        <ChevronRight className="size-3.5 text-slate-400" />
        <span
          className="text-[10px] font-bold text-slate-600"
          style={{ writingMode: "vertical-rl" }}
        >
          {stage.name} · {opportunities.length}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-[240px] shrink-0 flex-col rounded-lg border bg-slate-100/70",
        isOver && "ring-2 ring-indigo-400"
      )}
      style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
    >
      <div className="flex items-center justify-between px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-slate-700">{stage.name}</p>
          <p className="text-[10px] text-slate-500">
            {opportunities.length} · {formatBRL(stageTotal(opportunities))}
          </p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-slate-400 hover:text-slate-600"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {opportunities.map((o) => (
          <OpportunityCard
            key={o.id}
            opportunity={o}
            owner={users.find((u) => u.id === o.ownerId)}
          />
        ))}
        {opportunities.length === 0 && (
          <p className="py-6 text-center text-[10px] text-slate-400">Solte um card aqui</p>
        )}
      </div>
    </div>
  );
}
