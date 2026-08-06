"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TABS = [
  { label: "Integrações" },
  { label: "Visão geral" },
  { label: "Solicitações" },
  { label: "Avaliações" },
  { label: "Depoimentos em vídeo" },
  { label: "Widgets" },
  { label: "Listagens" },
  { label: "Configurações" },
];

const PLATFORMS = [
  { name: "Google Business Profile", connected: true },
  { name: "Facebook", connected: true },
  { name: "Booking.com", connected: false },
  { name: "Airbnb", connected: false },
  { name: "Amazon", connected: false },
  { name: "Capterra", connected: false },
  { name: "Glassdoor", connected: false },
  { name: "App Store", connected: false },
  { name: "Google Play", connected: false },
  { name: "Expedia", connected: false },
  { name: "iFood", connected: false },
  { name: "Reclame Aqui", connected: false },
];

export default function ReputacaoPage() {
  const [tab, setTab] = useState("Integrações");
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Integrações" ? (
          <EmptyState
            icon={Star}
            title={`${tab} — em construção`}
            description="Coleta de avaliações, widgets e depoimentos serão aprofundados nas próximas etapas."
          />
        ) : (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Integrações de reputação</h1>
            <p className="mb-4 text-xs text-slate-500">
              Conecte plataformas de avaliação para importar e responder reviews da sua empresa.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLATFORMS.map((p) => (
                <div key={p.name} className="flex flex-col rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                      {p.name[0]}
                    </span>
                    <Badge
                      variant="secondary"
                      className={p.connected ? "bg-emerald-100 text-emerald-700" : ""}
                    >
                      {p.connected ? "Conexão ativa" : "Não conectado"}
                    </Badge>
                  </div>
                  <p className="mt-2 flex-1 text-sm font-semibold text-slate-800">{p.name}</p>
                  <Button
                    variant={p.connected ? "outline" : "default"}
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info(`Integração com ${p.name} chega com o backend`)}
                  >
                    {p.connected ? "Gerenciar" : "Conectar conta"}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
