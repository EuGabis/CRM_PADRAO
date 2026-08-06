"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { contactName } from "@/lib/data/repos/contacts";
import { useDbContacts } from "@/lib/data/repos/db/contacts";
import { oppActions, usePipelineDb } from "@/lib/data/repos/db/pipeline";

export function OpportunityDialog({
  open,
  onOpenChange,
  pipelineId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pipelineId: string;
}) {
  const { contacts } = useDbContacts();
  const { pipelines } = usePipelineDb();
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const [contactId, setContactId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [value, setValue] = useState("0");
  const [source, setSource] = useState("Manual");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const contact = contacts.find((c) => c.id === contactId);
    const stage = pipeline?.stages.find((s) => s.id === stageId) ?? pipeline?.stages[0];
    if (!contact || !stage) {
      toast.error("Escolha um contato e uma fase");
      return;
    }
    setSaving(true);
    const ok = await oppActions.add({
      contactId,
      contactName: contactName(contact),
      pipelineId,
      stageId: stage.id,
      value: Number(value) || 0,
      source: source.trim() || "Manual",
    });
    setSaving(false);
    if (!ok) {
      toast.error("Não foi possível criar a oportunidade");
      return;
    }
    toast.success("Oportunidade criada");
    setContactId("");
    setStageId("");
    setValue("0");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Contato *</Label>
            <Select value={contactId} onValueChange={(v) => setContactId(v ?? "")}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>
                  {contactId
                    ? contactName(contacts.find((c) => c.id === contactId)!)
                    : "Selecionar contato"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {contacts.slice(0, 100).map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {contactName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contacts.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Você ainda não tem contatos — crie um no módulo Contatos primeiro.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fase *</Label>
            <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>
                  {stageId
                    ? pipeline?.stages.find((s) => s.id === stageId)?.name
                    : "Selecionar fase"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pipeline?.stages.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fonte</Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} className="h-8" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Criando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
