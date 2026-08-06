"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/config/brand";

export default function MeuPerfilPage() {
  const [signatureOn, setSignatureOn] = useState(true);

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Meu perfil</h1>
      <p className="mb-5 text-xs text-slate-500">Seus dados pessoais no {brand.name}.</p>
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input defaultValue="Gabriel" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sobrenome</Label>
            <Input defaultValue="Pereira" className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">E-mail</Label>
          <Input defaultValue="gabriel@litocrm.com.br" className="h-8 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Senha</Label>
            <Input type="password" defaultValue="••••••••••" disabled className="h-8 text-sm" />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => toast.info("Alteração de senha chega com o backend")}
          >
            Alterar senha
          </Button>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Assinatura de mensagens</Label>
            <Switch checked={signatureOn} onCheckedChange={(v) => setSignatureOn(!!v)} />
          </div>
          <Textarea
            disabled={!signatureOn}
            defaultValue={`Gabriel Pereira · ${brand.name}\n${brand.tagline}`}
            className="min-h-16 text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Anexada automaticamente a todas as mensagens de saída.
          </p>
        </div>
        <Button size="sm" className="text-xs" onClick={() => toast.success("Perfil salvo (sessão)")}>
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
