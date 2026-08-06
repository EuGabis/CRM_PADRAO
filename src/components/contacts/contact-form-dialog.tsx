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
import { contactActions } from "@/lib/data/repos/contacts";

export function ContactFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    tags: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Nome e sobrenome são obrigatórios");
      return;
    }
    contactActions.add({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      company: form.company.trim() || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      ownerId: "u-gustavo",
      dnd: false,
      customFields: {},
    });
    toast.success("Contato criado");
    setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", tags: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome *</Label>
            <Input value={form.firstName} onChange={set("firstName")} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sobrenome *</Label>
            <Input value={form.lastName} onChange={set("lastName")} className="h-8" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" value={form.email} onChange={set("email")} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telefone</Label>
            <Input value={form.phone} onChange={set("phone")} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Empresa</Label>
            <Input value={form.company} onChange={set("company")} className="h-8" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Tags (separadas por vírgula)</Label>
            <Input value={form.tags} onChange={set("tags")} className="h-8" placeholder="quente, negociando" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Salvar contato</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
