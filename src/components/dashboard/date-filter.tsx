"use client";

import { useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS = [
  "Hoje",
  "Últimos 7 dias",
  "Últimos 30 dias",
  "Este mês",
  "Trimestre passado",
  "Este ano",
];

export function DateFilter() {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("Trimestre passado");
  const [applied, setApplied] = useState("Trimestre passado");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 gap-2 text-xs" />}
      >
        <CalendarIcon className="size-3.5" />
        {applied}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-4">
        <div className="flex gap-4">
          <Calendar mode="single" className="rounded-md border" />
          <Calendar mode="single" className="hidden rounded-md border lg:block" />
        </div>
        <div className="mt-3 space-y-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">
              Selecionar o intervalo de datas
            </p>
            <Select value={preset} onValueChange={(v) => v && setPreset(v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">
              Intervalo de comparação
            </p>
            <Select defaultValue="none">
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  Sem comparação
                </SelectItem>
                <SelectItem value="prev" className="text-xs">
                  Período anterior
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setApplied(preset);
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
