"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/config/brand";

export default function PerfilEmpresaPage() {
  const [form, setForm] = useState({
    name: "Lito Comercial",
    email: "contato@litocrm.com.br",
    phone: "+55 21 3828-0872",
    address: "São Gonçalo, Rio de Janeiro",
    timezone: "GMT-03:00 América/São Paulo",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Perfil da empresa</h1>
      <p className="mb-5 text-xs text-slate-500">
        Dados exibidos nas comunicações e documentos do {brand.name}.
      </p>
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-xl bg-indigo-500 text-xl font-black text-white">
            {form.name[0]}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => toast.info("Upload de logo chega com o backend")}
          >
            Alterar logo
          </Button>
        </div>
        {(
          [
            ["name", "Nome da empresa"],
            ["email", "E-mail"],
            ["phone", "Telefone"],
            ["address", "Endereço"],
            ["timezone", "Fuso horário"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input value={form[k]} onChange={set(k)} className="h-8 text-sm" />
          </div>
        ))}
        <Button size="sm" className="text-xs" onClick={() => toast.success("Perfil salvo (sessão)")}>
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
