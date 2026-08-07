"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/config/brand";
import { accountActions, useAccount } from "@/lib/data/repos/db/account";
import { useMyMembership } from "@/lib/data/repos/db/team";

export default function MeuPerfilPage() {
  const { profile, loaded } = useAccount();
  const { me } = useMyMembership();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [signatureOn, setSignatureOn] = useState(true);

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    const res = await accountActions.updateProfile({ name: name.trim() });
    setSaving(false);
    res.ok ? toast.success("Perfil atualizado") : toast.error(res.error ?? "Não foi possível salvar");
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Meu perfil</h1>
      <p className="mb-5 text-xs text-slate-500">
        Seus dados no {brand.name}. O nome aparece para a equipe e nos convites que você envia.
      </p>
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex size-12 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ background: profile?.color ?? "#6366f1" }}
          >
            {(name[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{profile?.email}</p>
            <p className="text-[11px] text-slate-500">
              {me?.role === "admin" ? "Administrador" : "Usuário"} nesta empresa
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">E-mail</Label>
          <Input value={profile?.email ?? ""} disabled className="h-8 text-sm" />
          <p className="text-[10px] text-slate-400">
            O e-mail é o seu login e não pode ser alterado aqui.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Assinatura de mensagens</Label>
            <Switch checked={signatureOn} onCheckedChange={(v) => setSignatureOn(!!v)} />
          </div>
          <Textarea
            disabled={!signatureOn}
            defaultValue={`${name} · ${brand.name}`}
            className="min-h-16 text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Anexada às mensagens de saída (aplicação real chega com o envio pelos canais).
          </p>
        </div>

        <Button size="sm" className="text-xs" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
