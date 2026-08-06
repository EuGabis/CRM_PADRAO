"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const INTEGRATIONS = [
  { name: "Google Calendar", desc: "Sincronização bidirecional de agenda", connected: true },
  { name: "Meta Ads", desc: "Públicos, conversões e lead ads", connected: true },
  { name: "Stripe", desc: "Pagamentos e assinaturas", connected: true },
  { name: "Google Analytics", desc: "Métricas de site e funis", connected: false },
  { name: "Zapier", desc: "Conecte com mais de 5.000 apps", connected: false },
  { name: "Webhook personalizado", desc: "Envie eventos para qualquer endpoint", connected: false },
];

export default function IntegracoesPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-slate-900">Integrações</h1>
      <p className="mb-5 text-xs text-slate-500">Conecte o CRM às ferramentas que sua operação já usa.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="flex flex-col rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                {i.name[0]}
              </span>
              {i.connected && <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-800">{i.name}</p>
            <p className="mt-0.5 flex-1 text-[11px] text-slate-500">{i.desc}</p>
            <Button
              variant={i.connected ? "outline" : "default"}
              size="sm"
              className="mt-3 h-7 text-xs"
              onClick={() => toast.info(`Integração com ${i.name} chega com o backend`)}
            >
              {i.connected ? "Gerenciar" : "Conectar"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
