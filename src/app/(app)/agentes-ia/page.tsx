"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Conversation AI" },
  { label: "Começando" },
  { label: "IA de voz" },
  { label: "Base de Conhecimento" },
  { label: "Modelos de agente" },
  { label: "Content AI" },
  { label: "Logs" },
];

const AGENTS = [
  { name: "IA Comercial", main: true, status: "Sugestivo", channels: "WhatsApp · SMS" },
  { name: "Bot de Suporte", main: false, status: "Desativado", channels: "SMS" },
  { name: "Isabela — Recuperação de carrinho", main: false, status: "Sugestivo", channels: "WhatsApp" },
];

const BOT_ACTIONS = [
  { label: "Agendamento de compromissos", active: true, count: 1 },
  { label: "Acionar um fluxo de trabalho", active: false, count: 0 },
  { label: "Informações de contato", active: true, count: 2 },
  { label: "Parar bot", active: true, count: 1 },
  { label: "Transferência humana", active: true, count: 3 },
  { label: "Transferir bot", active: false, count: 0 },
  { label: "Follow-up automático", active: true, count: 2 },
];

export default function AgentesIaPage() {
  const [tab, setTab] = useState("Conversation AI");
  const [chat, setChat] = useState<{ from: "user" | "bot"; text: string }[]>([
    { from: "bot", text: "Olá! Sou a IA Comercial do Lito. Me pergunte algo para testar." },
  ]);
  const [input, setInput] = useState("");
  const [actions, setActions] = useState(BOT_ACTIONS);

  const sendTest = () => {
    if (!input.trim()) return;
    setChat((c) => [
      ...c,
      { from: "user", text: input.trim() },
      {
        from: "bot",
        text: "Resposta simulada da IA — com o backend conectado, este bot responderá usando os prompts de Personalidade, Meta e Informações adicionais.",
      },
    ]);
    setInput("");
  };

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Conversation AI" ? (
          <EmptyState
            icon={Bot}
            title={`${tab} — em construção`}
            description="Esta área de Agentes de IA será aprofundada nas próximas etapas."
          />
        ) : (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">
              Agentes de Conversation AI
            </h1>
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <KpiCard label="Contatos únicos" value="79" delta={-91.6} />
              <KpiCard label="Ações acionadas" value="12" delta={8.4} />
              <KpiCard label="Compromissos agendados" value="4" delta={2.1} />
              <KpiCard label="Tempo economizado" value="42 min" delta={-97.1} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div className="rounded-xl border bg-white">
                  <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <h2 className="text-sm font-semibold text-slate-700">Lista de agentes</h2>
                    <Button size="sm" className="h-7 text-xs" onClick={() => toast.info("Criação de bots chega com o backend")}>
                      + Criar bot
                    </Button>
                  </div>
                  <p className="border-b bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
                    Importante: somente o agente principal responde às mensagens recebidas.
                  </p>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-[11px] text-slate-400">
                        <th className="px-4 py-2 font-medium">Nome do agente</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Canais</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AGENTS.map((a) => (
                        <tr key={a.name} className="border-b last:border-0">
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {a.name}{" "}
                            {a.main && <Badge className="ml-1 bg-indigo-100 text-[9px] text-indigo-700">Principal</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant="secondary"
                              className={cn(a.status === "Sugestivo" && "bg-emerald-100 text-emerald-700")}
                            >
                              {a.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">{a.channels}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700">
                      Metas do bot — IA Comercial
                    </h2>
                    <Badge variant="secondary">Modelo: GPT-4.1</Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Personalidade *</Label>
                      <Textarea
                        defaultValue="Você é a Laura, assistente comercial do Lito CRM. Tom simpático, direto e consultivo."
                        className="min-h-16 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Meta *</Label>
                      <Textarea
                        defaultValue="Seu objetivo é levar o lead até a assinatura da plataforma, agendando uma demonstração quando houver interesse."
                        className="min-h-16 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Informações adicionais *</Label>
                      <Textarea
                        defaultValue="O Lito CRM organiza leads, centraliza atendimento omnichannel e permite automações ilimitadas. Plano a partir de R$147/mês."
                        className="min-h-16 text-xs"
                      />
                    </div>
                  </div>
                  <p className="mt-3 mb-1.5 text-xs font-bold text-slate-700">Configure suas ações</p>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map((a, i) => (
                      <button
                        key={a.label}
                        onClick={() =>
                          setActions((arr) =>
                            arr.map((x, xi) => (xi === i ? { ...x, active: !x.active } : x))
                          )
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          a.active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {a.label}
                        {a.active && a.count > 0 && (
                          <span className="rounded-full bg-indigo-500 px-1.5 text-[9px] font-bold text-white">
                            {a.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-fit flex-col rounded-xl border bg-white">
                <div className="border-b px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-slate-700">Testar seu bot</h2>
                </div>
                <div className="flex max-h-80 min-h-56 flex-col gap-2 overflow-y-auto p-3 [scrollbar-width:thin]">
                  {chat.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-1.5 text-xs",
                        m.from === "bot"
                          ? "self-start bg-slate-100 text-slate-700"
                          : "self-end bg-indigo-500 text-white"
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t p-2.5">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendTest()}
                    placeholder="Enviar uma mensagem"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="size-8 p-0" onClick={sendTest}>
                    <Send className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
