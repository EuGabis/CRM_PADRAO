"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ScheduleDialog({
  open,
  onOpenChange,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSchedule: (iso: string) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Agendar mensagem</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hora</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fuso horário</Label>
            <Select defaultValue="sp">
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>GMT-03:00 América/São Paulo</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sp" className="text-xs">
                  GMT-03:00 América/São Paulo
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setDate("");
              setTime("09:00");
            }}
          >
            Limpar
          </Button>
          <Button
            disabled={!date}
            onClick={() => {
              onSchedule(`${date}T${time}:00-03:00`);
              onOpenChange(false);
            }}
          >
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
