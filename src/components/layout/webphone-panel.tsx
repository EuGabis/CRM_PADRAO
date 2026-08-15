"use client";

import { useState } from "react";
import { Clock, Delete, Phone, Smartphone, Users, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWebphone } from "./webphone-store";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const TABS = [
  { icon: Clock, label: "Recentes" },
  { icon: Users, label: "Contatos" },
  { icon: Phone, label: "Teclado" },
  { icon: Voicemail, label: "Correio" },
];

export function WebphonePanel() {
  const { number, target, press, backspace, setNumber } = useWebphone();
  const [tab, setTab] = useState("Teclado");

  return (
    <div className="w-64 p-3">
      <p className="mb-1 text-center text-[10px] text-slate-400">
        Ligando de · CRM ON Comercial +55 21 3828-0872
      </p>
      {target && (
        <p className="mb-1 truncate text-center text-[11px] font-semibold text-indigo-600">
          Para {target}
        </p>
      )}
      <div className="mb-2 flex h-9 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold tracking-widest text-slate-800">
        {number ? (
          <span className="truncate px-2 text-base">{number}</span>
        ) : (
          <span className="text-sm font-normal text-slate-400">Digite o número</span>
        )}
      </div>
      {tab === "Teclado" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
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
            if (!number) {
              toast.error("Digite um número");
              return;
            }
            toast.info(`Chamada VoIP para ${number} chega com o backend`);
          }}
          title="Chamar por VoIP (depende de provedor de voz)"
          className="flex size-11 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
        >
          <Phone className="size-5" />
        </button>
        <button
          onClick={backspace}
          title="Apagar"
          className="flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
        >
          <Delete className="size-4" />
        </button>
      </div>
      {/* Enquanto não há provedor de voz, o caminho que realmente completa a
          ligação é o discador do aparelho. */}
      {number && (
        <a
          href={`tel:${number}`}
          className="mt-2 flex items-center justify-center gap-1 text-[10px] font-medium text-indigo-600 hover:underline"
        >
          <Smartphone className="size-3" /> Discar no celular
        </a>
      )}
      {number && (
        <button
          onClick={() => setNumber("")}
          className="mt-1 block w-full text-center text-[10px] text-slate-400 hover:text-slate-600"
        >
          Limpar
        </button>
      )}
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
