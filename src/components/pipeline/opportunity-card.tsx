"use client";

import { useDraggable } from "@dnd-kit/core";
import {
  Calendar,
  CheckSquare,
  FileText,
  MessageCircle,
  Phone,
  Tag,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/data/repos/opportunities";
import type { Opportunity, User } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { icon: Phone, label: "Ligar" },
  { icon: MessageCircle, label: "Abrir conversa" },
  { icon: Tag, label: "Tags" },
  { icon: FileText, label: "Notas" },
  { icon: CheckSquare, label: "Adicionar tarefa" },
  { icon: Calendar, label: "Agendar compromisso" },
];

export function OpportunityCard({
  opportunity,
  owner,
  dragging,
}: {
  opportunity: Opportunity;
  owner?: User;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunity.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "cursor-grab rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow",
        (isDragging || dragging) && "opacity-60 shadow-lg ring-2 ring-indigo-300"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold text-slate-800">
          {opportunity.name}
        </p>
        {owner ? (
          <Avatar className="size-5 shrink-0">
            <AvatarFallback
              className="text-[8px] font-bold text-white"
              style={{ background: owner.color }}
            >
              {owner.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span
            title="Não atribuído"
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed text-slate-400"
          >
            <UserPlus className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[10px] text-slate-500">
        Fonte: <span className="text-slate-600">{opportunity.source}</span>
      </p>
      <p className="text-[10px] text-slate-500">
        Valor: <span className="font-semibold text-slate-700">{formatBRL(opportunity.value)}</span>
      </p>
      <div className="mt-2 flex items-center gap-1 border-t pt-1.5">
        {QUICK_ACTIONS.map(({ icon: Icon, label }) => (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <button
                  className="flex size-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <Icon className="size-3" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
