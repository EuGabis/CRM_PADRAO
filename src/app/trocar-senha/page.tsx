"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/config/brand";
import { createClient } from "@/lib/supabase/client";

/**
 * Fora de (app) de propósito — mesmo motivo de /suspensa: o layout de (app)
 * redireciona para cá enquanto profiles.must_change_password for true, e uma
 * tela dentro de (app) disparia o redirect de novo ao renderizar.
 */
export default function TrocarSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  // Fica true assim que o Auth aceita a nova senha. Numa nova tentativa (ex.:
  // a chamada a /api/conta/senha-trocada falhou da primeira vez), não repete
  // o updateUser — o GoTrue rejeitaria com "a nova senha é igual à atual" e a
  // pessoa ficaria presa sem entender por quê.
  const [passwordChanged, setPasswordChanged] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não são iguais");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    if (!passwordChanged) {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // "New password should be different from the old password": sinal de
        // que a senha já foi trocada numa tentativa anterior (ex.: em outra
        // aba, ou nesta mesma se o estado local se perdeu com um reload).
        // Trata como sucesso e segue para baixar a flag, em vez de travar a
        // pessoa num erro que ela não causou.
        const mesmaSenha = /different from the old|should be different/i.test(
          updateError.message
        );
        if (!mesmaSenha) {
          setLoading(false);
          toast.error(updateError.message || "Não foi possível trocar a senha");
          return;
        }
      }
      setPasswordChanged(true);
    }

    // A coluna must_change_password só a service role consegue baixar (trigger
    // da 0052). Sem esta chamada dar certo, o shell manda de volta para cá em
    // laço — por isso o erro é mostrado, nunca escondido com um redirect otimista.
    try {
      const resp = await fetch("/api/conta/senha-trocada", { method: "POST" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setLoading(false);
        toast.error(
          body?.error ??
            "Senha trocada, mas não foi possível concluir. Recarregue a página e tente de novo."
        );
        return;
      }
    } catch {
      setLoading(false);
      toast.error(
        "Senha trocada, mas não foi possível concluir. Recarregue a página e tente de novo."
      );
      return;
    }

    toast.success("Senha alterada com sucesso!");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--crm-sidebar-accent)] text-sm font-black text-white">
            {brand.shortName[0]}
          </div>
          <span className="text-base font-bold text-slate-900">{brand.name}</span>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-indigo-100">
            <KeyRound className="size-5 text-indigo-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Defina uma nova senha</h1>
          <p className="mt-1 text-sm text-slate-500">
            É seu primeiro acesso. Escolha uma senha só sua antes de continuar.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Nova senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="h-10 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Confirme a senha</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Repita a senha"
                className="h-10 bg-white"
              />
            </div>
            <Button className="h-10 w-full text-sm" disabled={loading} onClick={submit}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Salvar e continuar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
