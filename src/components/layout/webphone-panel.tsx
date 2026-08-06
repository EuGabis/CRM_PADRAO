"use client";

import { useState } from "react";
import { Clock, Delete, Phone, Users, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const TABS = [
  { icon: Clock, label: "Recentes" },
  { icon: Users, label: "Contatos" },
  { icon: Phone, label: "Teclado" },
  { icon: Voicemail, label: "Correio" },
];

export function WebphonePanel() {
  const [number, setNumber] = useState("");
  const [tab, setTab] = useState("Teclado");

  return (
    <div className="w-64 p-3">
      <p className="mb-1 text-center text-[10px] text-slate-400">
        Ligando de · Lito Comercial +55 21 3828-0872
      </p>
      <div className="mb-2 flex h-9 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold tracking-widest text-slate-800">
        {number || <span className="text-sm font-normal text-slate-400">Digite o número</span>}
      </div>
      {tab === "Teclado" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setNumber((n) => n + k)}
              className="rounded-lg bg-slate-50 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              {k}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-xs text-slate-400">
          {tab} — em breve
        </div>
      )}
      <div className="mt-2 flex items-center justify-center gap-3">
        <button
          onClick={() => {
            if (number) toast.info(`Chamada VoIP para ${number} chega com o backend`);
          }}
          className="flex size-11 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
        >
          <Phone className="size-5" />
        </button>
        <button
          onClick={() => setNumber((n) => n.slice(0, -1))}
          className="flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
        >
          <Delete className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-around border-t pt-2">
        {TABS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => setTab(label)}
            className={cn(
              "flex flex-col items-center gap-0.5 text-[9px]",
              tab === label ? "text-indigo-600" : "text-slate-400"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
