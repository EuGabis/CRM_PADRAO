"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ConfigCalendariosPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Calendários</h1>
      <p className="mb-5 text-xs text-slate-500">Conexões e preferências de agendamento da conta.</p>

      <div className="mb-4 flex items-center justify-between rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
            G
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Google Calendar</p>
            <p className="text-[11px] text-slate-500">gustavo@litocrm.com.br</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info("Gestão da conexão chega com o backend")}>
            Gerenciar
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Duração padrão da reunião</Label>
          <Select defaultValue="45">
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue>45 minutos</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["30", "45", "60"].map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m} minutos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <Label className="text-xs font-semibold">Intervalo entre reuniões (buffer)</Label>
          <Select defaultValue="15">
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue>15 minutos</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["0", "10", "15", "30"].map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m} minutos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="text-xs" onClick={() => toast.success("Preferências salvas (sessão)")}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
