"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function EmailConfigPage() {
  const [smtp, setSmtp] = useState(false);

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Serviços de e-mail</h1>
      <p className="mb-5 text-xs text-slate-500">Remetente, domínio de envio e SMTP dedicado.</p>
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="space-y-1">
          <Label className="text-xs">Remetente padrão</Label>
          <Input defaultValue="Equipe Lito <contato@litocrm.com.br>" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Domínio de envio</Label>
          <div className="flex items-center gap-2">
            <Input defaultValue="mail.litocrm.com.br" className="h-8 text-sm" />
            <Badge className="shrink-0 bg-emerald-100 text-emerald-700">Verificado</Badge>
          </div>
          <p className="text-[10px] text-slate-400">SPF, DKIM e DMARC configurados corretamente.</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-xs font-semibold">SMTP dedicado</Label>
            <p className="text-[11px] text-slate-500">Use seu próprio servidor de envio</p>
          </div>
          <Switch checked={smtp} onCheckedChange={(v) => setSmtp(!!v)} />
        </div>
        <Button size="sm" className="text-xs" onClick={() => toast.success("Configurações salvas (sessão)")}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
