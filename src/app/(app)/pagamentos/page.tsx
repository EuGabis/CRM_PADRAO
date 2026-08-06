"use client";

import { useState } from "react";
import { CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Integrações" },
  { label: "Arquivos e contratos" },
  { label: "Pagamentos" },
  { label: "Faturas e estimativas" },
  { label: "Pedidos" },
  { label: "Assinaturas" },
  { label: "Links de pagamento" },
  { label: "Vendas" },
  { label: "Produtos" },
  { label: "Cupons" },
  { label: "Gift Cards" },
  { label: "Configurações" },
];

const PROVIDERS = [
  { name: "Stripe", desc: "Cartões, wallets (Apple/Google Pay), débitos bancários e multi-moeda.", connected: true },
  { name: "Mercado Pago", desc: "Pix, boleto, cartões e assinaturas para o mercado brasileiro.", connected: false },
  { name: "PayPal", desc: "Saldo PayPal, cartões e contas bancárias vinculadas.", connected: false },
  { name: "Square", desc: "POS e pagamentos online (EUA, Canadá, Reino Unido, Austrália).", connected: false },
  { name: "Adyen", desc: "Europa, Oriente Médio e mercados globais.", connected: false },
  { name: "Authorize.net", desc: "Cartões e e-check/ACH (EUA e Canadá).", connected: false },
  { name: "NMI", desc: "Conexões flexíveis a processadores, cartões e ACH.", connected: false },
  { name: "Métodos manuais", desc: "Pagamento offline/custom (dinheiro na entrega etc.).", connected: false },
];

const DOC_STATUS = [
  { label: "Rascunho", count: 1 },
  { label: "Aguardando por outros", count: 1 },
  { label: "Concluído", count: 2 },
  { label: "Pagamentos", count: 2 },
  { label: "Arquivado", count: 0 },
];

const DOCS = [
  { title: "Contrato de assinatura — Maurício Magalhães", status: "Concluído", client: "MM", date: "30 jun 2026", value: "R$ 147,00" },
  { title: "Proposta implementação — Linx Consultoria", status: "Aguardando por outros", client: "TS", date: "28 jul 2026", value: "R$ 2.000,00" },
  { title: "Contrato de assinatura — Carla Santos", status: "Concluído", client: "CS", date: "22 jul 2026", value: "R$ 197,00" },
  { title: "Novo Documento", status: "Rascunho", client: "GR", date: "1 ago 2026", value: "R$ 0,00" },
];

export default function PagamentosPage() {
  const [tab, setTab] = useState("Integrações");
  const [docTab, setDocTab] = useState("Rascunho");

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Integrações" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Integrações de pagamento</h1>
                <p className="text-xs text-slate-500">Gerencie provedores de pagamento aqui</p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => toast.info("Configuração de provedores chega com o backend")}>
                Configurar provedores
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {PROVIDERS.map((p) => (
                <div key={p.name} className="flex flex-col rounded-xl border bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                      {p.name[0]}
                    </span>
                    {p.connected && <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="mt-1 flex-1 text-[11px] text-slate-500">{p.desc}</p>
                  <Button
                    variant={p.connected ? "outline" : "default"}
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info(`Conexão com ${p.name} chega com o backend`)}
                  >
                    {p.connected ? "Gerenciar" : "Conectar"}
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : tab === "Arquivos e contratos" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Documentos e contratos</h1>
                <p className="text-xs text-slate-500">Propostas, estimativas e contratos com assinatura eletrônica</p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => toast.info("Editor de documentos chega em breve")}>
                + Novo
              </Button>
            </div>
            <div className="mb-3 flex gap-1">
              {DOC_STATUS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setDocTab(s.label)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium",
                    docTab === s.label ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {s.label} ({s.count})
                </button>
              ))}
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Título</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Modificado</th>
                    <th className="px-4 py-2.5 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCS.filter((d) => docTab === "Pagamentos" ? d.value !== "R$ 0,00" : d.status === docTab || docTab === "Todos").map((d) => (
                    <tr key={d.title} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{d.title}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn(
                            d.status === "Concluído" && "bg-emerald-100 text-emerald-700",
                            d.status === "Aguardando por outros" && "bg-amber-100 text-amber-700"
                          )}
                        >
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex size-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                          {d.client}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{d.date}</td>
                      <td className="px-4 py-2.5 font-semibold text-emerald-600">{d.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={tab === "Pagamentos" ? CreditCard : FileText}
            title={`${tab} — em construção`}
            description="Esta sub-aba de Pagamentos será aprofundada nas próximas etapas."
          />
        )}
      </div>
    </div>
  );
}
