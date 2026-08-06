"use client";

import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";

const TABS = [
  { label: "Google Ads" },
  { label: "Relatórios personalizados" },
  { label: "Anúncios Meta" },
  { label: "Atribuição" },
  { label: "Ligações" },
  { label: "Agentes" },
  { label: "Compromissos" },
];

const SERIES = Array.from({ length: 14 }, (_, i) => ({
  dia: `${16 + i > 31 ? 16 + i - 31 : 16 + i}/06`,
  impressoes: 8000 + ((i * 1237) % 6000),
  cliques: 900 + ((i * 311) % 800),
  conversoes: 300 + ((i * 97) % 400),
}));

const CAMPAIGNS = [
  { name: "Lito — Consultoria gratuita", status: "Ativa", clicks: 8412, cost: "R$ 812,00", revenue: "R$ 9.410,00", roi: "1.058%", ctr: "4,2%", leads: 214, cpl: "R$ 3,79" },
  { name: "Lito — Teste grátis 7 dias", status: "Ativa", clicks: 6120, cost: "R$ 640,00", revenue: "R$ 6.230,00", roi: "873%", ctr: "3,8%", leads: 187, cpl: "R$ 3,42" },
  { name: "Remarketing — Demonstração", status: "Ativa", clicks: 3355, cost: "R$ 298,00", revenue: "R$ 3.120,00", roi: "947%", ctr: "5,1%", leads: 96, cpl: "R$ 3,10" },
  { name: "Institucional — Marca", status: "Pausada", clicks: 2101, cost: "R$ 195,00", revenue: "R$ 890,00", roi: "356%", ctr: "2,2%", leads: 31, cpl: "R$ 6,29" },
  { name: "Lookalike — Assinantes", status: "Ativa", clicks: 1150, cost: "R$ 140,00", revenue: "R$ 1.470,00", roi: "950%", ctr: "3,1%", leads: 42, cpl: "R$ 3,33" },
];

function MetricArea({ title, dataKey, total }: { title: string; dataKey: string; total: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-900">{total}</p>
      <div className="mt-2 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SERIES}>
            <defs>
              <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dia" hide />
            <Tooltip />
            <Area type="monotone" dataKey={dataKey} stroke="#6366f1" fill={`url(#g-${dataKey})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function RelatoriosPage() {
  const [tab, setTab] = useState("Google Ads");
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Google Ads" ? (
          <EmptyState
            icon={BarChart3}
            title={`${tab} — em construção`}
            description="Relatórios personalizados agendáveis, Meta Ads e atribuição chegam nas próximas etapas."
          />
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
              Você está visualizando dados de amostra. Conecte sua conta do Google Ads para ver os
              dados reais.
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <MetricArea title="Impressões" dataKey="impressoes" total="175.235" />
              <MetricArea title="Cliques" dataKey="cliques" total="21.138" />
              <MetricArea title="Conversões" dataKey="conversoes" total="7.125" />
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <KpiCard label="Investimento" value="R$ 2.085,00" />
              <KpiCard label="CPC médio" value="R$ 0,10" />
              <KpiCard label="Custo por conversão" value="R$ 0,29" />
              <KpiCard label="Taxa de conversão" value="6,90%" />
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Campanha</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Cliques</th>
                    <th className="px-4 py-2.5 font-medium">Custo</th>
                    <th className="px-4 py-2.5 font-medium">Receita</th>
                    <th className="px-4 py-2.5 font-medium">ROI</th>
                    <th className="px-4 py-2.5 font-medium">CTR</th>
                    <th className="px-4 py-2.5 font-medium">Leads</th>
                    <th className="px-4 py-2.5 font-medium">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {CAMPAIGNS.map((c) => (
                    <tr key={c.name} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={c.status === "Ativa" ? "bg-emerald-100 text-emerald-700" : ""}
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">{c.clicks.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5">{c.cost}</td>
                      <td className="px-4 py-2.5">{c.revenue}</td>
                      <td className="px-4 py-2.5 font-semibold text-emerald-600">{c.roi}</td>
                      <td className="px-4 py-2.5">{c.ctr}</td>
                      <td className="px-4 py-2.5">{c.leads}</td>
                      <td className="px-4 py-2.5">{c.cpl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
