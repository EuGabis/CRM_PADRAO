"use client";

import { useState } from "react";
import { Bell, Headset, LifeBuoy, Phone } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SupportPanel } from "./support-panel";
import { WebphonePanel } from "./webphone-panel";

export function Topbar() {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b bg-[#0d1117] px-4">
      <button
        onClick={() => setSupportOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-lime-400 px-3 py-1 text-xs font-bold text-lime-950 hover:bg-lime-300"
      >
        <LifeBuoy className="size-3.5" />
        Suporte
      </button>
      <Popover>
        <PopoverTrigger
          render={
            <button className="flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600" />
          }
        >
          <Headset className="size-3.5" />
          Webphone
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0">
          <WebphonePanel />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger
          render={
            <button className="flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400" />
          }
        >
          <Phone className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0">
          <WebphonePanel />
        </PopoverContent>
      </Popover>
      <button
        onClick={() => toast.info("Central de notificações chega em breve")}
        className="relative flex size-7 items-center justify-center rounded-full text-slate-300 hover:bg-slate-700"
      >
        <Bell className="size-4" />
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-orange-400" />
      </button>
      <Avatar className="size-7">
        <AvatarFallback className="bg-indigo-500 text-[11px] font-bold text-white">GB</AvatarFallback>
      </Avatar>
      <SupportPanel open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}
