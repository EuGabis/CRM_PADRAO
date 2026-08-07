"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Check, LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { brand } from "@/lib/config/brand";
import { activationActions, useActivation } from "@/lib/data/repos/db/activation";
import { useTeam } from "@/lib/data/repos/db/team";

const STEPS = [
  {
    key: "app",
    title: "Baixar o app",
    bullets: [
      "Escolha o dispositivo (iOS, Android, macOS ou Windows)",
      "Instale o aplicativo ou programa",
      "Faça login com o usuário e senha recebidos por e-mail",
    ],
  },
  {
    key: "empresa",
    title: "Configurações da empresa",
    bullets: [
      "Insira o nome da empresa e o logo",
      "Ajuste o idioma da plataforma para português",
      "Adicione endereço e telefone da empresa",
      "Crie os usuários da equipe e defina permissões",
    ],
  },
  {
    key: "meta",
    title: "Integrar Facebook e Instagram",
    bullets: ["Conecte as páginas e contas comerciais", "Autorize as permissões de mensagens"],
  },
  {
    key: "whatsapp",
    title: "Conectar WhatsApp",
    bullets: ["Escolha entre API oficial ou QR Code", "Conecte o número principal da operação"],
  },
  {
    key: "pipeline",
    title: "Criar o pipeline (funil comercial)",
    bullets: ["Defina as fases do seu processo de vendas", "Configure valores e responsáveis"],
  },
  {
    key: "entrada-leads",
    title: "Automação de entrada de leads",
    bullets: ["Crie o fluxo de boas-vindas", "Direcione novos leads para o pipeline"],
  },
  {
    key: "follow-up",
    title: "Automação de follow-up",
    bullets: ["Configure lembretes automáticos", "Defina o prazo para mover leads sem resposta"],
  },
];

export default function AtivacaoPage() {
  const { steps, loaded } = useActivation();
  const { members } = useTeam();

  const byKey = useMemo(() => new Map(steps.map((s) => [s.key, s])), [steps]);
  const done = STEPS.map((s) => byKey.has(s.key));
  const completed = done.filter(Boolean).length;
  const pct = Math.round((completed / STEPS.length) * 100);
  const next = STEPS[done.findIndex((d) => !d)] ?? null;

  const toggle = async (stepKey: string, isDone: boolean) => {
    const ok = isDone
      ? await activationActions.undo(stepKey)
      : await activationActions.complete(stepKey);
    if (!ok) {
      toast.error(
        "Não foi possível salvar. Se o erro persistir, aplique a migração 0005 no Supabase."
      );
      return;
    }
    if (!isDone) toast.success("Passo concluído!");
  };

  const authorLabel = (key: string) => {
    const step = byKey.get(key);
    if (!step) return null;
    const who = members.find((m) => m.userId === step.completedBy)?.name;
    const when = format(new Date(step.completedAt), "d MMM yyyy 'às' HH:mm", { locale: ptBR });
    return who ? `Concluído por ${who} · ${when}` : `Concluído em ${when}`;
  };

  return (
    <div className="min-h-full bg-[#131826] p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime-300">
          {brand.name} · Onboarding
        </p>
        <h1 className="mt-1 text-xl font-bold">Checklist de ativação</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure sua operação comercial em poucos passos para começar a receber e converter
          leads.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-[#1d2436] p-4">
            <p className="flex items-center gap-2 text-2xl font-bold">
              {loaded ? `${completed} de ${STEPS.length}` : <Loader2 className="size-5 animate-spin" />}
            </p>
            <p className="text-xs text-slate-400">passos concluídos</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-[#1d2436] p-4">
            <div
              className="flex size-12 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(#a3e635 ${pct * 3.6}deg, #2b3245 0deg)`,
              }}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-[#1d2436] text-xs font-bold">
                {pct}%
              </span>
            </div>
            <p className="text-xs text-slate-400">de ativação concluída</p>
          </div>
          <div className="rounded-xl bg-[#1d2436] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-lime-300">
              Próximo passo
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              {next ? next.title : "Tudo concluído! 🎉"}
              {next && <ArrowRight className="size-3.5" />}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
          <Accordion defaultValue={["step-0"]} className="space-y-2">
            {STEPS.map((step, i) => (
              <AccordionItem
                key={i}
                value={`step-${i}`}
                className="rounded-xl border border-[#2b3245] bg-[#1d2436] px-4"
              >
                <AccordionTrigger className="py-3 text-sm font-semibold text-white hover:no-underline">
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                        done[i] ? "bg-lime-400 text-lime-950" : "bg-[#2b3245] text-slate-300"
                      }`}
                    >
                      {done[i] ? <Check className="size-3.5" /> : i}
                    </span>
                    Passo {i} — {step.title}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <ul className="mb-3 space-y-1.5">
                    {step.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-lime-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => toggle(step.key, done[i])}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                        done[i]
                          ? "bg-[#2b3245] text-slate-300"
                          : "bg-lime-400 text-lime-950 hover:bg-lime-300"
                      }`}
                    >
                      {done[i] ? "Desmarcar" : "Marcar como concluída"}
                    </button>
                    {done[i] && (
                      <span className="text-[10px] text-slate-400">{authorLabel(step.key)}</span>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="space-y-3">
            <div className="rounded-xl border border-[#2b3245] bg-[#1d2436] p-4">
              <p className="text-sm font-bold">Precisa de ajuda?</p>
              <p className="mt-1 text-xs text-slate-400">
                Nossa equipe está pronta para te ajudar em qualquer etapa.
              </p>
              <button
                onClick={() => toast.info("Chat de suporte disponível no topo da tela")}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-lime-400 py-2 text-[11px] font-bold text-lime-950 hover:bg-lime-300"
              >
                <LifeBuoy className="size-3.5" /> ABRIR SUPORTE
              </button>
            </div>
            <div className="rounded-xl border border-[#2b3245] bg-[#1d2436] p-4">
              <p className="text-sm font-bold">Custos adicionais</p>
              <p className="mt-1 text-xs text-slate-400">
                Algumas funcionalidades podem gerar custos externos, como integrações de WhatsApp,
                ligações e disparos.
              </p>
              <button
                onClick={() => toast.info("Artigo de custos chega em breve")}
                className="mt-3 text-[11px] font-bold text-lime-300 hover:underline"
              >
                VER ARTIGO DE CUSTOS →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
