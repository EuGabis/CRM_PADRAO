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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { useLimits } from "@/lib/data/repos/db/limits";
import { ConectarEvolution } from "@/components/whatsapp/conectar-evolution";

export function CreateChannelDialog() {
  const { whatsappProvider } = useLimits();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 text-xs" />}>
        Criar canal
      </DialogTrigger>
      {whatsappProvider === "evolution" ? (
        <EvolutionDialogContent onClose={() => setOpen(false)} />
      ) : (
        <MetaDialogContent onClose={() => setOpen(false)} />
      )}
    </Dialog>
  );
}

function EvolutionDialogContent({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [conectando, setConectando] = useState(false);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Novo canal de atendimento</DialogTitle>
      </DialogHeader>
      {conectando ? (
        <ConectarEvolution nome={nome.trim()} onConectado={onClose} />
      ) : (
        <>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Nome do canal</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Comercial — Vendas"
                className="h-8 text-xs"
              />
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Conectar por QR code: escaneie com o WhatsApp do número que vai atender por aqui.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!nome.trim()}
              onClick={() => setConectando(true)}
            >
              Conectar
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  );
}

function MetaDialogContent({ onClose }: { onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sector: "",
    phoneE164: "",
    phoneNumberId: "",
    wabaId: "",
    dailyLimit: "1000",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.phoneNumberId.trim()) {
      toast.error("Nome e phone_number_id são obrigatórios");
      return;
    }
    setSaving(true);
    const res = await whatsappActions.createChannel({
      name: form.name.trim(),
      sector: form.sector.trim(),
      phoneE164: form.phoneE164.trim(),
      phoneNumberId: form.phoneNumberId.trim(),
      wabaId: form.wabaId.trim(),
      dailyLimit: Number(form.dailyLimit) || 1000,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Canal criado");
      onClose();
      setForm({ name: "", sector: "", phoneE164: "", phoneNumberId: "", wabaId: "", dailyLimit: "1000" });
    } else {
      toast.error(res.error ?? "Não foi possível criar");
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Novo canal de atendimento</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        {(
          [
            ["name", "Nome do canal", "Ex.: Comercial — Vendas"],
            ["sector", "Setor", "Ex.: Comercial Principal"],
            ["phoneE164", "Número (E.164)", "+55 11 99999-9999"],
            ["phoneNumberId", "phone_number_id (Meta)", "Ex.: 123456789012345"],
            ["wabaId", "WABA id (Meta)", "Ex.: 987654321098765"],
            ["dailyLimit", "Limite diário", "1000"],
          ] as const
        ).map(([key, label, ph]) => (
          <div key={key} className="grid gap-1">
            <Label className="text-xs">{label}</Label>
            <Input
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={ph}
              className="h-8 text-xs"
            />
          </div>
        ))}
        <p className="text-[10px] leading-relaxed text-slate-400">
          Conectar de verdade = apontar o webhook da Meta para o CRM ON (passo manual no painel
          da Meta). Aqui só cadastramos o número.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={saving}>
          {saving ? "Criando..." : "Criar canal"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
