"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/config/brand";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.email.trim() || form.password.length < 8) {
      toast.error("Informe e-mail válido e senha com pelo menos 8 caracteres");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      setLoading(false);
      if (error) {
        toast.error(
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos"
            : error.message
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      if (!form.name.trim()) {
        toast.error("Informe seu nome");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            name: form.name.trim(),
            company: form.company.trim() || undefined,
          },
        },
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.session) {
        toast.success("Conta criada! Sua empresa e pipeline já estão prontos.");
        router.push("/dashboard");
        router.refresh();
      } else {
        // Projeto com confirmação de e-mail ativada
        setConfirmationSent(true);
      }
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca */}
      <div className="hidden w-[44%] flex-col justify-between bg-[var(--lito-sidebar)] p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--lito-sidebar-accent)] text-lg font-black text-white">
            {brand.shortName[0]}
          </div>
          <span className="text-xl font-bold text-white">{brand.name}</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold leading-tight text-white">
            {brand.tagline}
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-400">
            Conversas, pipelines, automações e relatórios — tudo ilimitado, em uma
            única plataforma.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          © 2026 {brand.name}
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          {confirmationSent ? (
            <div className="rounded-2xl border bg-white p-8 text-center">
              <h2 className="text-lg font-bold text-slate-900">Confirme seu e-mail</h2>
              <p className="mt-2 text-sm text-slate-500">
                Enviamos um link de confirmação para{" "}
                <span className="font-semibold text-slate-700">{form.email}</span>.
                Depois de confirmar, volte e faça login.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => {
                  setConfirmationSent(false);
                  setMode("login");
                }}
              >
                Voltar ao login
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white p-8">
              <h2 className="text-lg font-bold text-slate-900">
                {mode === "login" ? "Entrar" : "Criar conta"}
              </h2>
              <p className="mb-5 text-xs text-slate-500">
                {mode === "login"
                  ? `Acesse sua conta do ${brand.name}`
                  : "Sua empresa e pipeline são criados automaticamente"}
              </p>

              <div className="space-y-3">
                {mode === "signup" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Seu nome *</Label>
                      <Input value={form.name} onChange={set("name")} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome da empresa</Label>
                      <Input
                        value={form.company}
                        onChange={set("company")}
                        placeholder="Minha empresa"
                        className="h-9"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">E-mail *</Label>
                  <Input type="email" value={form.email} onChange={set("email")} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Senha *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Mínimo 8 caracteres"
                    className="h-9"
                  />
                </div>
                <Button className="w-full" disabled={loading} onClick={submit}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {mode === "login" ? "Entrar" : "Criar conta"}
                </Button>
              </div>

              <p className="mt-4 text-center text-xs text-slate-500">
                {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
                <button
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  className={cn("font-semibold text-indigo-600 hover:underline")}
                >
                  {mode === "login" ? "Criar conta" : "Entrar"}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
