"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACTIONS,
  CATEGORY_LABEL,
  TRIGGERS,
  type CatalogNode,
} from "./node-catalog";
import type { NodeCategory } from "@/lib/data/types";

export function NodePicker({
  open,
  onOpenChange,
  mode,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "trigger" | "action";
  onPick: (node: CatalogNode, kind: "trigger" | "action") => void;
}) {
  const [tab, setTab] = useState<"trigger" | "action">(mode);
  const [query, setQuery] = useState("");

  const list = tab === "trigger" ? TRIGGERS : ACTIONS;
  const filtered = useMemo(
    () => list.filter((n) => n.label.toLowerCase().includes(query.toLowerCase())),
    [list, query]
  );
  const categories = [...new Set(filtered.map((n) => n.category))] as NodeCategory[];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setTab(mode);
      }}
    >
      <SheetContent className="w-[360px] sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle>{tab === "trigger" ? "Adicionar acionador" : "Adicionar ação"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "trigger" | "action")}>
            <TabsList className="w-full">
              <TabsTrigger value="trigger" className="flex-1 text-xs">
                Gatilhos
              </TabsTrigger>
              <TabsTrigger value="action" className="flex-1 text-xs">
                Ações
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 rounded-md border px-2.5">
            <Search className="size-3.5 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "trigger" ? "Pesquisar acionadores" : "Pesquisar ações"}
              className="h-8 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto [scrollbar-width:thin]">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {CATEGORY_LABEL[cat]}
                </p>
                <div className="space-y-1">
                  {filtered
                    .filter((n) => n.category === cat)
                    .map((n) => (
                      <button
                        key={n.key}
                        onClick={() => {
                          onPick(n, tab);
                          onOpenChange(false);
                        }}
                        className="block w-full rounded-md border px-3 py-2 text-left text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        {n.label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-400">Nada encontrado</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
