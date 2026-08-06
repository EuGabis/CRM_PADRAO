"use client";

import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { KpiCard } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/config/brand";

const SHORTCUTS = [
  {
    title: "Agentes de IA",
    description: "Configure bots de conversa, IA de voz e a base de conhecimento.",
    href: "/agentes-ia",
    icon: Bot,
  },
  {
    title: "Automações com IA",
    description: "Adicione etapas de IA aos seus fluxos: classificar, responder e atualizar campos.",
    href: "/automacoes",
    icon: Zap,
  },
  {
    title: "Workflows AI",
    description: "Monte jornadas completas que combinam gatilhos, ações e decisões de IA.",
    href: "/automacoes",
    icon: Workflow,
  },
];

export default function AiStudioPage() {
  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-bold text-slate-900">AI Studio</h1>
      <p className="mb-4 text-xs text-slate-500">
        Central de inteligência artificial do {brand.name}: acompanhe resultados e acesse as
        ferramentas de IA.
      </p>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <KpiCard label="Agentes ativos" value="2" hint="IA Comercial e Recuperação de carrinho" />
        <KpiCard label="Conversas com IA no mês" value="312" delta={22.4} />
        <KpiCard label="Tempo economizado" value="9h 40min" delta={12.8} />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.title}
            href={s.href}
            className="group flex flex-col rounded-xl border bg-white p-4 transition-colors hover:border-indigo-300"
          >
            <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
              <s.icon className="size-4" />
            </span>
            <p className="text-sm font-semibold text-slate-800">{s.title}</p>
            <p className="mt-1 flex-1 text-xs text-slate-500">{s.description}</p>
            <span className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-600 group-hover:gap-1.5">
              Acessar <ArrowRight className="size-3.5 transition-all" />
            </span>
          </Link>
        ))}
      </div>

      <div className="max-w-2xl rounded-xl border bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Construa usando IA</h2>
            <p className="text-[11px] text-slate-400">
              Descreva o que você quer automatizar e a IA monta o primeiro rascunho.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Descreva sua ideia</Label>
            <Textarea
              placeholder="Ex.: quando um lead novo chegar pelo Instagram, responda em até 1 minuto e agende uma demonstração"
              className="min-h-20 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => toast.info("Geração com IA chega com o backend")}
          >
            <Sparkles className="size-3.5" /> Gerar
          </Button>
        </div>
      </div>
    </div>
  );
}
