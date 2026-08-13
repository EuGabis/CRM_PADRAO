"use client";

import { Plus, User, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Escopo da caixa de entrada. Antes o rail tinha cinco botões e nenhum
 * funcionava: "atribuídas a mim" não tinha responsável no banco, "conversas
 * com bot" não tinha bot, as visualizações salvas eram quatro nomes fixos no
 * código, e a busca duplicava o campo que já existe na própria lista. Ficaram
 * só os dois escopos que hoje têm dado por trás (migração 0024).
 */
export type InboxScope = "group" | "mine";

function RailButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof User;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={onClick}
            aria-pressed={active}
            className={`flex size-8 items-center justify-center rounded-md ${
              active ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:bg-slate-100"
            }`}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ViewsRail({
  onNew,
  scope,
  onScopeChange,
}: {
  onNew?: () => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
}) {
  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r bg-white py-2">
      <button
        onClick={onNew}
        title="Nova conversa"
        className="mb-1 flex size-8 items-center justify-center rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
      >
        <Plus className="size-4" />
      </button>
      <RailButton
        icon={Users}
        label="Caixa de entrada do grupo"
        active={scope === "group"}
        onClick={() => onScopeChange("group")}
      />
      <RailButton
        icon={User}
        label="Atribuídas a mim"
        active={scope === "mine"}
        onClick={() => onScopeChange("mine")}
      />
    </div>
  );
}
