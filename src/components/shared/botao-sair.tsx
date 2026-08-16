"use client";

import { LogOut } from "lucide-react";
import { clearBrowserSession } from "@/lib/auth/session-marker";
import { createClient } from "@/lib/supabase/client";

/**
 * Sair da conta fora do shell do CRM (/suspensa e /trocar-senha).
 *
 * Essas duas telas ficam fora de (app), então não têm o Topbar — e sem um jeito
 * de sair a pessoa fica presa: o cliente suspenso não consegue nem trocar de
 * conta, e quem desiste no meio do primeiro acesso também não.
 *
 * Mesma mecânica do Topbar: signOut com escopo "local" (não depende de rede),
 * limpeza do marcador de sessão e navegação dura para o middleware reavaliar
 * já com o cookie limpo.
 */
export function BotaoSair({ className = "" }: { className?: string }) {
  const sair = async () => {
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // ignora — segue para o login de qualquer forma
    }
    clearBrowserSession();
    window.location.href = "/login";
  };

  return (
    <button
      onClick={sair}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 ${className}`}
    >
      <LogOut className="size-3.5" />
      Sair da conta
    </button>
  );
}
