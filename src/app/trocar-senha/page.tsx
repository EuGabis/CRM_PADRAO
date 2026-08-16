"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BotaoSair } from "@/components/shared/botao-sair";
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
        // NÃO dá para tratar "a nova senha é igual à atual" como prova de que
        // a troca já aconteceu numa tentativa anterior: essa mesma mensagem
        // também aparece quando a pessoa digita a senha TEMPORÁRIA recebida
        // de quem cadastrou a empresa nos dois campos (por preguiça ou por
        // não entender a tela). Inferir sucesso a partir do texto do erro
        // deixaria a troca obrigatória passar batido — quem cadastrou a
        // empresa continuaria sabendo a senha do cliente, exatamente o que
        // esta tela existe para evitar. Por isso: erro é sempre erro, e quem
        // repetir a senha antiga recebe um pedido claro de senha diferente.
        const mesmaSenha = /different from the old|should be different/i.test(
          updateError.message
        );
        setLoading(false);
        toast.error(
          mesmaSenha
            ? "Escolha uma senha diferente da que você está usando agora."
            : updateError.message || "Não foi possível trocar a senha"
        );
        return;
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
    // Navegação DURA, não router.push + refresh: o Router Cache pode servir um
    // payload do layout de (app) capturado quando must_change_password ainda
    // era true, e o shell manda de volta para cá. A volta perde o estado
    // `passwordChanged`, a tentativa seguinte chama updateUser de novo e falha
    // com "senha igual à atual" — laço confuso no primeiro minuto do cliente.
    window.location.href = "/dashboard";
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
              {/* Travados depois que o Auth aceitou a senha: a partir daí o
                  submit não chama updateUser de novo, então um valor novo aqui
                  NÃO viraria a senha real — a tela diria sucesso e a pessoa
                  ficaria trancada fora no próximo login. */}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                disabled={passwordChanged}
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
                disabled={passwordChanged}
                className="h-10 bg-white"
              />
            </div>
            {passwordChanged && (
              <p className="text-xs text-slate-500">
                A senha já foi trocada. Falta só concluir — os campos ficam travados
                para não gravar uma senha diferente da que você definiu.
              </p>
            )}
            <Button className="h-10 w-full text-sm" disabled={loading} onClick={submit}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {passwordChanged ? "Concluir" : "Salvar e continuar"}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <BotaoSair />
        </div>
      </div>
    </div>
  );
}
