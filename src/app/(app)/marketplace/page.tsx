"use client";

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const APPS = [
  { name: "Canva", dev: "LeadConnector", desc: "Crie artes e criativos sem sair do CRM.", rating: 4.7, reviews: 42 },
  { name: "CloseBot", dev: "CloseBot", desc: "Qualificação de leads com IA conversacional.", rating: 4.7, reviews: 15 },
  { name: "Zoom For Workflows", dev: "All The Apps", desc: "Crie reuniões Zoom a partir de automações.", rating: 4.0, reviews: 3 },
  { name: "Kixie PowerCall & SMS", dev: "Kixie", desc: "Discador de vendas com gravação de chamadas.", rating: 3.2, reviews: 5 },
  { name: "WhatsApp ChatBot", dev: "All The Apps", desc: "Bot de atendimento 24/7 para WhatsApp.", rating: 4.9, reviews: 7 },
  { name: "Appointwise", dev: "Appointwise", desc: "Agendamento inteligente com IA.", rating: 5.0, reviews: 1 },
  { name: "Twilio", dev: "All The Apps", desc: "Voz, SMS e mais, feito para desenvolvedores.", rating: 3.2, reviews: 5 },
  { name: "WooCommerce For Workflows", dev: "All The Apps", desc: "Dispare automações a partir de pedidos.", rating: 4.8, reviews: 10 },
  { name: "Telegram ChatBot", dev: "All The Apps", desc: "Suporte 24/7 direto no Telegram.", rating: 4.8, reviews: 6 },
  { name: "Announcement Bar", dev: "Sites Apps", desc: "Barras de aviso para funis e sites.", rating: 5.0, reviews: 3 },
  { name: "Samantha AI SDR", dev: "Josh Ads", desc: "SDR de IA que vende e agenda demonstrações.", rating: 4.4, reviews: 13 },
  { name: "Slack Notifications", dev: "All The Apps", desc: "Alertas de leads e vendas no Slack.", rating: 4.6, reviews: 9 },
];

const FILTERS = [
  { group: "Categorias", options: ["Comunicação", "IA", "Vendas", "Sites", "Produtividade"] },
  { group: "Precificação", options: ["Gratuito", "Pago", "Freemium"] },
  { group: "Nicho", options: ["Serviços", "E-commerce", "Educação", "Saúde"] },
];

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const apps = useMemo(
    () => APPS.filter((a) => a.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <div className="flex">
      <aside className="hidden w-56 shrink-0 border-r bg-white p-4 lg:block">
        <p className="mb-2 text-xs font-bold text-slate-700">Filtros</p>
        <Accordion defaultValue={["Categorias"]}>
          {FILTERS.map((f) => (
            <AccordionItem key={f.group} value={f.group}>
              <AccordionTrigger className="py-2 text-xs font-semibold">{f.group}</AccordionTrigger>
              <AccordionContent className="space-y-1.5">
                {f.options.map((o) => (
                  <Label key={o} className="flex items-center gap-2 text-xs font-normal text-slate-600">
                    <Checkbox /> {o}
                  </Label>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </aside>
      <div className="flex-1 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Apps do Marketplace</h1>
            <p className="text-xs text-slate-500">
              1.505 apps para estender o seu CRM · 72 páginas
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-white px-2.5">
            <Search className="size-3.5 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar apps"
              className="h-8 w-48 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((a) => (
            <div key={a.name} className="flex flex-col rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-base font-black text-indigo-500">
                  {a.name[0]}
                </span>
                <Badge variant="secondary">Gratuito</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">{a.name}</p>
              <p className="text-[10px] text-slate-400">Por {a.dev}</p>
              <p className="mt-1 flex-1 text-[11px] text-slate-500">{a.desc}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {a.rating.toFixed(1)}
                  <span className="font-normal text-slate-400">({a.reviews})</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toast.info(`Instalação do ${a.name} chega com o backend`)}
                >
                  Instalar
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
          {["1", "2", "3", "…", "72"].map((p) => (
            <button
              key={p}
              className={`flex size-7 items-center justify-center rounded-md ${
                p === "1" ? "bg-indigo-500 font-bold text-white" : "hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
