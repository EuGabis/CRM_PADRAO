"use client";

import { useState } from "react";
import { Copy, GraduationCap, Link2, Mail, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";

const TABS = [
  { label: "Portal do cliente" },
  { label: "Cursos" },
  { label: "Comunidades" },
  { label: "Certificados" },
  { label: "Marketplace" },
];

const PORTAL_URL = "https://clientes.litocrm.com.br";

export default function AssinaturasPage() {
  const [tab, setTab] = useState("Portal do cliente");
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Portal do cliente" ? (
          <EmptyState
            icon={GraduationCap}
            title={`${tab} — em construção`}
            description="Cursos, comunidades e certificados serão aprofundados nas próximas etapas."
          />
        ) : (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Portal do cliente</h1>
            <p className="mb-4 text-xs text-slate-500">
              Seus clientes fazem login a qualquer momento para acessar cursos e gerenciar
              pagamentos.
            </p>
            <div className="mb-4 flex items-center justify-between rounded-xl border bg-white p-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">URL do Portal do cliente</p>
                <p className="text-sm font-bold text-indigo-600">{PORTAL_URL}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(PORTAL_URL);
                  toast.success("URL copiada");
                }}
              >
                <Copy className="size-3.5" /> Copiar
              </Button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <KpiCard label="Convidados" value="0" />
              <KpiCard label="Usuários ativos" value="25" delta={12.5} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { icon: Wand2, title: "Gerar link mágico", desc: "Login sem senha para um cliente", action: "Gerar" },
                { icon: Link2, title: "Convidar para o portal", desc: "Envie um convite de acesso", action: "Convidar" },
                { icon: Mail, title: "Enviar e-mail de login", desc: "Reenvie as credenciais de acesso", action: "Enviar" },
              ].map(({ icon: Icon, title, desc, action }) => (
                <div key={title} className="rounded-xl border bg-white p-4">
                  <Icon className="size-5 text-indigo-500" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{desc}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info(`${title} chega com o backend`)}
                  >
                    {action}
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
