"use client";

import { useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Planejador Social" },
  { label: "E-mails" },
  { label: "Trechos" },
  { label: "Contadores regressivos" },
  { label: "Links de acionamento" },
  { label: "Afiliados" },
  { label: "Brand Boards" },
  { label: "Gerenciador de anúncios" },
];

const INNER_TABS = ["Planejador", "Conteúdo", "Comentários", "Estatísticas", "Escuta social", "Configurações"];

const NETWORKS = [
  "Facebook",
  "Instagram",
  "Google Business Profile",
  "LinkedIn",
  "TikTok",
  "YouTube",
  "Pinterest",
  "Threads",
  "Bluesky",
  "Comunidade",
];

const POSTS = [
  { caption: 'Comente "AUTOMACAO" e receba 70% de desconto na assinatura', status: "Publicado", type: "Compositor", date: "21 jun 2026 10:00", network: "Instagram" },
  { caption: "5 sinais de que sua empresa precisa de um CRM", status: "Publicado", type: "Compositor", date: "28 jun 2026 09:00", network: "Facebook" },
  { caption: "Bastidores: como automatizamos 80% do follow-up", status: "Rascunho", type: "Nativa", date: "5 jul 2026 14:00", network: "Instagram" },
  { caption: "Case: +40% de conversão com pipeline automatizado", status: "Publicado", type: "Compositor", date: "12 jul 2026 11:00", network: "LinkedIn" },
  { caption: "Novidade: agente de IA no atendimento", status: "Rascunho", type: "Compositor", date: "1 ago 2026 16:00", network: "Instagram" },
];

export default function MarketingPage() {
  const [tab, setTab] = useState("Planejador Social");
  const [innerTab, setInnerTab] = useState("Planejador");
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Planejador Social" ? (
          <EmptyState
            icon={Megaphone}
            title={`${tab} — em construção`}
            description="Esta área de Marketing será aprofundada nas próximas etapas."
          />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Planejador Social</h1>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConnectOpen(true)}>
                  <Plus className="size-3.5" /> Redes sociais
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Compositor de publicações chega em breve")}>
                  <Plus className="size-3.5" /> Nova publicação
                </Button>
              </div>
            </div>
            <div className="mb-3 flex gap-1">
              {INNER_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setInnerTab(t)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium",
                    innerTab === t ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {innerTab === "Planejador" ? (
              <div className="rounded-xl border bg-white">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[11px] text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Legenda</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Tipo</th>
                      <th className="px-4 py-2.5 font-medium">Data</th>
                      <th className="px-4 py-2.5 font-medium">Rede</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POSTS.map((p) => (
                      <tr key={p.caption} className="border-b last:border-0">
                        <td className="max-w-72 truncate px-4 py-2.5 font-medium text-slate-800">{p.caption}</td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant="secondary"
                            className={cn(p.status === "Publicado" && "bg-emerald-100 text-emerald-700")}
                          >
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{p.type}</td>
                        <td className="px-4 py-2.5 text-slate-500">{p.date}</td>
                        <td className="px-4 py-2.5 text-slate-500">{p.network}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Megaphone}
                title={`${innerTab} — em construção`}
                description="Comentários unificados, estatísticas por rede e escuta social chegam nas próximas etapas."
              />
            )}
          </>
        )}
      </div>
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar redes sociais</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {NETWORKS.map((n) => (
              <button
                key={n}
                onClick={() => toast.info(`Conexão com ${n} chega com o backend`)}
                className="rounded-lg border px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
              >
                Conectar {n}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
