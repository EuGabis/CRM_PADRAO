"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import {
  PRESETS,
  presetLabel,
  resolvePreset,
  useDashboardRange,
  type DateRange,
  type PresetKey,
} from "./date-range";

export function DateFilter() {
  const { preset, range, apply } = useDashboardRange();
  const [open, setOpen] = useState(false);

  // Rascunho local: só vira filtro de verdade quando o usuário clica Aplicar.
  const [draftPreset, setDraftPreset] = useState<PresetKey>(preset);
  const [draftRange, setDraftRange] = useState<DateRange>(range);

  // Reabrir o popover recomeça do que está aplicado hoje.
  useEffect(() => {
    if (open) {
      setDraftPreset(preset);
      setDraftRange(range);
    }
  }, [open, preset, range.from, range.to]);

  const pickPreset = (key: PresetKey) => {
    setDraftPreset(key);
    if (key !== "personalizado") setDraftRange(resolvePreset(key));
  };

  // Escolher dias no calendário vira automaticamente "Personalizado".
  const pickDays = (sel: { from?: Date; to?: Date } | undefined) => {
    if (!sel?.from) return;
    setDraftPreset("personalizado");
    setDraftRange({ from: sel.from, to: sel.to ?? sel.from });
  };

  const label =
    preset === "personalizado"
      ? `${format(range.from, "dd MMM", { locale: ptBR })} – ${format(range.to, "dd MMM yyyy", { locale: ptBR })}`
      : presetLabel(preset);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 gap-2 text-xs" />}
      >
        <CalendarIcon className="size-3.5" />
        {label}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-4">
        <Calendar
          mode="range"
          locale={ptBR}
          numberOfMonths={2}
          defaultMonth={draftRange.from}
          selected={{ from: draftRange.from, to: draftRange.to }}
          onSelect={pickDays}
          className="rounded-md border"
        />
        <div className="mt-3 space-y-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">
              Selecionar o intervalo de datas
            </p>
            <Select value={draftPreset} onValueChange={(v) => v && pickPreset(v as PresetKey)}>
              <SelectTrigger className="h-8 w-full text-xs">
                {/* Base UI não resolve o rótulo a partir do value — children explícito (AGENTS.md). */}
                <SelectValue>{presetLabel(draftPreset)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-slate-400">
            {format(draftRange.from, "dd MMM yyyy", { locale: ptBR })} até{" "}
            {format(draftRange.to, "dd MMM yyyy", { locale: ptBR })}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                apply(draftPreset, draftRange);
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
