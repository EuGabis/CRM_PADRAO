"use client";

import { Bell, Headset, LifeBuoy, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Topbar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b bg-[#0d1117] px-4">
      <button className="flex items-center gap-1.5 rounded-full bg-lime-400 px-3 py-1 text-xs font-bold text-lime-950 hover:bg-lime-300">
        <LifeBuoy className="size-3.5" />
        Suporte
      </button>
      <button className="flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600">
        <Headset className="size-3.5" />
        Webphone
      </button>
      <button className="flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400">
        <Phone className="size-3.5" />
      </button>
      <button className="relative flex size-7 items-center justify-center rounded-full text-slate-300 hover:bg-slate-700">
        <Bell className="size-4" />
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-orange-400" />
      </button>
      <Avatar className="size-7">
        <AvatarFallback className="bg-indigo-500 text-[11px] font-bold text-white">GB</AvatarFallback>
      </Avatar>
    </header>
  );
}
