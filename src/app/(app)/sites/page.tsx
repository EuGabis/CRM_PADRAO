"use client";

import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

const TABS = [
  { label: "Funis" },
  { label: "Sites" },
  { label: "Lojas" },
  { label: "Webinars" },
  { label: "Analytics" },
  { label: "Blogs" },
  { label: "WordPress" },
  { label: "Portal do cliente" },
  { label: "Formulários" },
  { label: "Pesquisas" },
  { label: "Testes" },
  { label: "Widget de chat" },
  { label: "Códigos QR" },
];

const FORMS = [
  { name: "Captação — Consultoria gratuita", updated: "28 jul 2026", by: "Gustavo Ribeiro" },
  { name: "Quiz Lito — Teste grátis", updated: "22 jul 2026", by: "Lucas Gomes" },
  { name: "Pesquisa de satisfação NPS", updated: "15 jul 2026", by: "Camila Braga" },
  { name: "Formulário de onboarding", updated: "8 jul 2026", by: "Gustavo Ribeiro" },
];

export default function SitesPage() {
  const [tab, setTab] = useState("Funis");
  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Funis" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Funis</h1>
                <p className="text-xs text-slate-500">
                  Crie e gerencie funis para gerar leads, compromissos e receber pagamentos
                </p>
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Construtor de funis chega em breve")}>
                <Plus className="size-3.5" /> Novo funil
              </Button>
            </div>
            <EmptyState
              icon={Globe}
              title="Comece criando um funil"
              description="Todos os seus funis e pastas ficarão aqui. Conecte seu domínio próprio e publique páginas de captura, vendas e obrigado."
              cta={
                <Button size="sm" className="text-xs" onClick={() => toast.info("Construtor de funis chega em breve")}>
                  <Plus className="size-3.5" /> Novo funil
                </Button>
              }
            />
          </>
        ) : tab === "Formulários" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Formulários</h1>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Construtor de formulários chega em breve")}>
                <Plus className="size-3.5" /> Criar formulário
              </Button>
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Nome</th>
                    <th className="px-4 py-2.5 font-medium">Atualizado em</th>
                    <th className="px-4 py-2.5 font-medium">Atualizado por</th>
                  </tr>
                </thead>
                <tbody>
                  {FORMS.map((f) => (
                    <tr key={f.name} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{f.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{f.updated}</td>
                      <td className="px-4 py-2.5 text-slate-500">{f.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Globe}
            title={`${tab} — em construção`}
            description="Sites, lojas, blogs, webinars e demais ferramentas web serão aprofundados nas próximas etapas."
          />
        )}
      </div>
    </div>
  );
}
