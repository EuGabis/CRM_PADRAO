"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface FilterCondition {
  field: string;
  operator: "é" | "não é" | "contém";
  value: string;
  join?: "E" | "OU";
}

const OPERATORS: FilterCondition["operator"][] = ["é", "não é", "contém"];

export function FilterDrawer({
  open,
  onOpenChange,
  fields,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fields: string[];
  onApply: (conditions: FilterCondition[]) => void;
}) {
  const [conditions, setConditions] = useState<FilterCondition[]>([
    { field: fields[0] ?? "", operator: "é", value: "" },
  ]);

  const update = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCondition = (join: "E" | "OU") =>
    setConditions((cs) => [...cs, { field: fields[0] ?? "", operator: "é", value: "", join }]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle>Filtros avançados</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-4">
          {conditions.map((c, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              {c.join && (
                <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                  {c.join}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Select value={c.field} onValueChange={(v) => update(i, { field: v ?? "" })}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conditions.length > 1 && (
                  <button
                    onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Select
                value={c.operator}
                onValueChange={(v) =>
                  update(i, { operator: (v ?? "é") as FilterCondition["operator"] })
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op} value={op} className="text-xs">
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={c.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="Valor"
                className="h-8 text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addCondition("E")}>
              <Plus className="size-3" /> E
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addCondition("OU")}>
              <Plus className="size-3" /> OU
            </Button>
          </div>
        </div>
        <SheetFooter className="flex-row justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConditions([{ field: fields[0] ?? "", operator: "é", value: "" }])}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(conditions.filter((c) => c.value.trim() !== ""));
              onOpenChange(false);
            }}
          >
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
