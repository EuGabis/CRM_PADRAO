"use client";

import { useState } from "react";
import { Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [{ label: "API Não Oficial" }, { label: "API Oficial" }];

const INSTANCES = [
  { name: "Comercial 01", number: "+55 21 9****-**72", connected: true },
  { name: "Comercial 02", number: "+55 21 9****-**18", connected: true },
  { name: "Suporte", number: "+55 21 9****-**33", connected: true },
  { name: "Financeiro", number: "+55 21 9****-**90", connected: false },
  { name: "Pós-venda", number: "+55 21 9****-**41", connected: true },
  { name: "Instância reserva", number: "—", connected: false },
];

const TEMPLATES = [
  { name: "copy_desconto70", lang: "Português (BR)", cat: "Marketing", preview: "Olá {{1}}! Vi que você tentou assinar...", status: "Ativo" },
  { name: "copy_testegratis", lang: "Português (BR)", cat: "Marketing", preview: "Olá {{1}}! Seu teste grátis de 7 dias...", status: "Ativo" },
  { name: "followup_reuniao", lang: "Português (BR)", cat: "Utility", preview: "Oi {{1}}, lembrete da nossa reunião às {{2}}...", status: "Ativo" },
];

export default function WhatsappPage() {
  const [tab, setTab] = useState("API Não Oficial");

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === "API Não Oficial" ? (
        <div className="min-h-[calc(100vh-6rem)] bg-[#131826] p-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="flex items-center gap-2 text-lg font-bold text-white">
                  <Smartphone className="size-5 text-emerald-400" /> Instâncias WhatsApp
                </h1>
                <p className="text-xs text-slate-400">
                  {INSTANCES.length} instâncias · conexão via QR Code
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-emerald-500 text-xs hover:bg-emerald-400"
                onClick={() => toast.info("Nova instância via QR Code chega com o backend")}
              >
                <Plus className="size-3.5" /> Nova instância
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INSTANCES.map((inst, i) => (
                <div key={inst.name} className="rounded-xl border border-[#2b3245] bg-[#1d2436] p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
                      {inst.name[0]}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">#{i + 1}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{inst.name}</p>
                  <p className="text-[11px] text-slate-400">{inst.number}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        inst.connected ? "bg-emerald-400" : "bg-slate-500"
                      )}
                    />
                    <span className={inst.connected ? "text-emerald-300" : "text-slate-400"}>
                      {inst.connected ? "Conectado" : "Não conectado"}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900">WhatsApp Business (API Oficial)</h1>
              <div className="mt-1 flex gap-1.5">
                <Badge className="bg-emerald-100 text-emerald-700">Aprovado</Badge>
                <Badge className="bg-emerald-100 text-emerald-700">Negócio verificado (Meta)</Badge>
                <Badge className="bg-emerald-100 text-emerald-700">Marketing habilitado</Badge>
              </div>
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Adição de números chega com o backend")}>
              <Plus className="size-3.5" /> Adicionar número
            </Button>
          </div>

          <div className="mb-5 rounded-xl border bg-white">
            <p className="border-b px-4 py-2.5 text-sm font-semibold text-slate-700">Números</p>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[11px] text-slate-400">
                  <th className="px-4 py-2 font-medium">Número</th>
                  <th className="px-4 py-2 font-medium">País</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Qualidade</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    (21) 3828-0872 <Badge variant="secondary" className="ml-1 text-[9px]">Padrão</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">Brasil</td>
                  <td className="px-4 py-2.5">
                    <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="size-2 rounded-full bg-emerald-500" /> Verde
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-700">Modelos de mensagem</p>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info("Criação de templates chega com o backend")}>
                + Criar modelo
              </Button>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[11px] text-slate-400">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Idioma</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Mensagem</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {TEMPLATES.map((t) => (
                  <tr key={t.name} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-800">{t.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{t.lang}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary">{t.cat}</Badge>
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5 text-slate-500">{t.preview}</td>
                    <td className="px-4 py-2.5">
                      <Badge className="bg-emerald-100 text-emerald-700">{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            A API oficial da Meta possui custos próprios (~US$ 11/mês) + custo por template
            aprovado.
          </p>
        </div>
      )}
    </div>
  );
}
