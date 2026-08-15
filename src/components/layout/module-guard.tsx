"use client";

import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/config/nav";
import { useMyMembership } from "@/lib/data/repos/db/team";

/**
 * Guarda de ROTA. A sidebar já esconde o item, mas esconder link não impede
 * navegação direta pela URL.
 *
 * Isto é UX, não segurança: quem protege de verdade são os triggers do banco
 * e as checagens nas rotas de API. Aqui a função é explicar o bloqueio.
 */
export function ModuleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loaded, can, planBlocks } = useMyMembership();

  const item = NAV_ITEMS.find((i) => pathname.startsWith(i.href));

  // Sem item mapeado (ex.: /configuracoes) ou membership ainda carregando:
  // deixa passar. Bloquear durante o load faria a tela piscar "sem acesso".
  if (!item || !loaded) return <>{children}</>;
  if (can(item.key)) return <>{children}</>;

  const porPlano = planBlocks(item.key);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center">
        <Lock className="mx-auto mb-3 size-8 text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900">
          {porPlano ? "Módulo não incluído no seu plano" : "Sem acesso a este módulo"}
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          {porPlano
            ? `O módulo ${item.label} não faz parte do plano desta empresa. Fale com o suporte para liberar.`
            : `Você não tem permissão para acessar ${item.label}. Peça a um administrador da sua empresa.`}
        </p>
      </div>
    </div>
  );
}
