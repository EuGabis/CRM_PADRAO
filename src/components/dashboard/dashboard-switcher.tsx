"use client";

import { useState } from "react";
import { ChevronDown, LayoutGrid, Pin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MY_DASHBOARDS = ["(Padrão) Visão Geral", "SDR Acompanhamento", "Funil Comercial"];
const SHARED = ["Dashboard da Diretoria"];

export function DashboardSwitcher() {
  const [current, setCurrent] = useState(MY_DASHBOARDS[0]);
  const [query, setQuery] = useState("");

  const filter = (list: string[]) =>
    list.filter((d) => d.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-sm font-bold" />
        }
      >
        <LayoutGrid className="size-4 text-indigo-500" />
        {current}
        <ChevronDown className="size-3.5 text-slate-400" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="mb-2 flex items-center gap-2 rounded-md border px-2">
          <Search className="size-3.5 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar um painel"
            className="h-7 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <button
          onClick={() => toast.info("Criação de painéis chega junto com o backend")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <Plus className="size-3.5" /> Adicionar painel
        </button>
        <p className="mt-2 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Meus painéis de controle
        </p>
        {filter(MY_DASHBOARDS).map((d) => (
          <button
            key={d}
            onClick={() => setCurrent(d)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            {d}
            <Pin className="size-3 text-slate-300" />
          </button>
        ))}
        <p className="mt-2 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Compartilhado comigo
        </p>
        {filter(SHARED).map((d) => (
          <button
            key={d}
            onClick={() => setCurrent(d)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            {d}
            <Pin className="size-3 text-slate-300" />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
