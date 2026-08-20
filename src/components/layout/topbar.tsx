"use client";

import { useEffect, useState } from "react";
import { Headset, LifeBuoy, LogOut, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/config/brand";
import { clearBrowserSession } from "@/lib/auth/session-marker";
import { NotificationsPanel } from "./notifications-panel";
import { SupportPanel } from "./support-panel";
import { WebphonePanel } from "./webphone-panel";
import { useWebphone } from "./webphone-store";

export function Topbar() {
  const [supportOpen, setSupportOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { open: webphoneOpen, setOpen: setWebphoneOpen } = useWebphone();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    // Escopo "local": limpa a sessão/cookie deste dispositivo na hora, sem depender
    // de uma chamada de rede que poderia falhar e travar o logout. O try/catch garante
    // que, mesmo se algo der errado, ainda saímos para o /login.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignora — segue para o login de qualquer forma
    }
    clearBrowserSession(); // some com o marcador de sessão do navegador também
    // Navegação dura: força o middleware a reavaliar já com o cookie limpo.
    window.location.href = "/login";
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b bg-[#0d1117] px-4">
      {/* Marca à esquerda só no mobile: a Sidebar (que já mostra a marca) fica
          escondida abaixo de md. `mr-auto` empurra o resto dos botões pra
          direita. */}
      <div className="mr-auto flex items-center gap-2 md:hidden">
        <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--crm-sidebar-accent)] text-xs font-black text-white">
          {brand.shortName[0]}
        </div>
        <span className="text-sm font-bold text-white">{brand.name}</span>
      </div>
      <button
        onClick={() => setSupportOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-lime-400 px-3 py-1 text-xs font-bold text-lime-950 hover:bg-lime-300"
      >
        <LifeBuoy className="size-3.5" />
        <span className="hidden sm:inline">Suporte</span>
      </button>
      {/* Popover controlado: "Ligar" no card do kanban e no cabeçalho da
          conversa abrem ESTE painel, com o número do contato já no visor. */}
      <Popover open={webphoneOpen} onOpenChange={setWebphoneOpen}>
        <PopoverTrigger
          render={
            <button className="flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600" />
          }
        >
          <Headset className="size-3.5" />
          <span className="hidden md:inline">Webphone</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0">
          <WebphonePanel />
        </PopoverContent>
      </Popover>
      {/* Abria um segundo popover com o MESMO painel; agora só chama o de cima. */}
      <button
        onClick={() => setWebphoneOpen(true)}
        title="Abrir o webphone"
        className="hidden size-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400 sm:flex"
      >
        <Phone className="size-3.5" />
      </button>
      {/* O sino agora abre a central de verdade (avisos derivados de conversas,
          agenda e agendamentos que falharam), no lugar do toast "chega em breve". */}
      <NotificationsPanel />
      <DropdownMenu>
        <DropdownMenuTrigger render={<button className="rounded-full" />}>
          <Avatar className="size-7">
            <AvatarFallback className="bg-indigo-500 text-[11px] font-bold text-white">
              {(userEmail?.[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">
            {userEmail ?? "Carregando..."}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="size-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SupportPanel open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}
