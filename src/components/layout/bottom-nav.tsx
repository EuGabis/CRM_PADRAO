"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "@/lib/config/nav";
import { useMyMembership } from "@/lib/data/repos/db/team";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Navegação mobile: barra de abas fixa no rodapé (só aparece abaixo de `md`; no
 * desktop a Sidebar continua sendo a navegação). Quatro módulos principais + um
 * botão "Mais" que abre uma folha inferior com o menu completo — a mesma lista
 * da Sidebar (NAV_ITEMS de `lib/config/nav`, filtrada pelas permissões do
 * usuário). Respeita a safe-area inferior do iPhone.
 */

// Chaves dos módulos fixos na barra, na ordem de prioridade acordada. Se o
// usuário não tiver permissão para algum, ele simplesmente não aparece.
const PRIMARY_KEYS = ["conversas", "leads", "contatos", "calendarios"];

function TabLink({
  item,
  active,
  label,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  label?: string;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
        active ? "text-indigo-600" : "text-slate-500",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="max-w-full truncate">{label ?? item.label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { can } = useMyMembership();
  const [maisAberto, setMaisAberto] = useState(false);

  const primary = PRIMARY_KEYS.map((k) => NAV_ITEMS.find((i) => i.key === k))
    .filter((i): i is NavItem => !!i && can(i.key));

  // "Mais" fica ativo quando a rota atual não é nenhum dos módulos fixos.
  const emMais = !primary.some((i) => pathname.startsWith(i.href));

  // Menu completo da folha: todos os módulos permitidos + Configurações.
  const todos = [...NAV_ITEMS.filter((i) => can(i.key)), SETTINGS_ITEM];

  // Rótulos curtos para caber na barra estreita.
  const rotuloCurto: Record<string, string> = {
    conversas: "Conversas",
    leads: "Leads",
    contatos: "Contatos",
    calendarios: "Agenda",
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => (
          <TabLink
            key={item.href}
            item={item}
            label={rotuloCurto[item.key]}
            active={pathname.startsWith(item.href)}
          />
        ))}
        <button
          type="button"
          onClick={() => setMaisAberto(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
            emMais ? "text-indigo-600" : "text-slate-500",
          )}
        >
          <MoreHorizontal className="size-5 shrink-0" />
          <span>Mais</span>
        </button>
      </nav>

      <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-6">
            {todos.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMaisAberto(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-medium transition-colors",
                    active
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
