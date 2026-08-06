"use client";

import { useState } from "react";
import { FileText, Mic, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/config/brand";
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

const COMPARISON = [
  { metric: "Chamadas perdidas", human: "62%", ai: "<3%" },
  { metric: "Chats sem resposta", human: "78%", ai: "0%" },
  { metric: "Disponibilidade", human: "8h/dia", ai: "24x7" },
  { metric: "Tempo de resposta", human: "~34min", ai: "<1s" },
  { metric: "Conversão de leads", human: "23%", ai: "48%" },
];

const KNOWLEDGE_SOURCES = [
  { name: "FAQ Lito.pdf", type: "PDF", size: "1,2 MB", status: "Indexado", added: "12/07/2026" },
  { name: "litocrm.com.br/precos", type: "URL", size: "—", status: "Indexado", added: "15/07/2026" },
  { name: "Roteiro de objeções comerciais", type: "Texto", size: "18 KB", status: "Indexado", added: "22/07/2026" },
  { name: "Manual de onboarding.pdf", type: "PDF", size: "3,8 MB", status: "Processando", added: "05/08/2026" },
];

const AGENT_TEMPLATES = [
  {
    name: "SDR de qualificação",
    description: "Qualifica leads com perguntas de orçamento, prazo e necessidade antes de passar ao time comercial.",
  },
  {
    name: "Suporte N1",
    description: "Responde dúvidas frequentes usando a Base de Conhecimento e transfere casos complexos para humanos.",
  },
  {
    name: "Recuperação de carrinho",
    description: "Aborda contatos que abandonaram o checkout com ofertas e responde objeções em tempo real.",
  },
  {
    name: "Agendadora de reuniões",
    description: "Negocia horários e marca demonstrações direto no calendário conectado, sem intervenção humana.",
  },
];

const CONTENT_SAMPLES: Record<string, string> = {
  "Post Instagram":
    "🚀 Seu atendimento não precisa dormir. Com agentes de IA, cada lead recebe resposta em segundos — a qualquer hora. Comece hoje e veja sua conversão subir. #CRM #Vendas #IA",
  "E-mail":
    "Assunto: Seus leads estão esperando uma resposta\n\nOlá, {{contato.primeiro_nome}}!\n\nSabia que 78% dos chats sem resposta viram oportunidades perdidas? Com nosso agente de IA, cada mensagem é respondida em menos de 1 segundo, 24 horas por dia.\n\nQue tal ver isso funcionando no seu funil? Responda este e-mail e agende uma demonstração gratuita.\n\nAbraços,\nEquipe Comercial",
  "Anúncio":
    "Pare de perder leads fora do horário comercial. Atendimento com IA que responde em <1s, qualifica e agenda reuniões sozinho. Teste grátis por 7 dias — sem cartão de crédito.",
};

const AI_LOGS = [
  { at: "06/08/2026 09:42", agent: "IA Comercial", contact: "Maurício Sampaio", event: "Resposta enviada", channel: "WhatsApp" },
  { at: "06/08/2026 09:15", agent: "IA Comercial", contact: "Eduarda Nunes", event: "Campo atualizado", channel: "WhatsApp" },
  { at: "06/08/2026 08:57", agent: "Isabela — Recuperação de carrinho", contact: "Thiago Linx", event: "Resposta enviada", channel: "WhatsApp" },
  { at: "05/08/2026 18:24", agent: "IA Comercial", contact: "Mariana Prado", event: "Transferido p/ humano", channel: "SMS" },
  { at: "05/08/2026 16:03", agent: "Bot de Suporte", contact: "Hugo Ferraz", event: "Resposta enviada", channel: "SMS" },
  { at: "05/08/2026 11:31", agent: "IA Comercial", contact: "Quésia Moura", event: "Campo atualizado", channel: "WhatsApp" },
];

export default function AgentesIaPage() {
  const [tab, setTab] = useState("Conversation AI");
  const [chat, setChat] = useState<{ from: "user" | "bot"; text: string }[]>([
    { from: "bot", text: "Olá! Sou a IA Comercial do Lito. Me pergunte algo para testar." },
  ]);
  const [input, setInput] = useState("");
  const [actions, setActions] = useState(BOT_ACTIONS);
  const [voice, setVoice] = useState("Feminina");
  const [afterHours, setAfterHours] = useState(true);
  const [contentFormat, setContentFormat] = useState("Post Instagram");
  const [contentPrompt, setContentPrompt] = useState("");
  const [contentResult, setContentResult] = useState<string | null>(null);

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
        {tab === "Conversation AI" && (
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

        {tab === "Começando" && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 text-center">
              <Badge className="mb-3 bg-indigo-100 text-indigo-700">Agentes de IA do {brand.shortName}</Badge>
              <h1 className="text-lg font-bold text-slate-900">Sua IA de atendimento 24/7</h1>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Compare o desempenho de um time humano com um agente de IA do {brand.name} e
                comece a atender cada lead em segundos.
              </p>
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Métrica</th>
                    <th className="px-4 py-2.5 font-medium">Agente Humano</th>
                    <th className="px-4 py-2.5 font-medium">Agente de IA</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.metric} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.metric}</td>
                      <td className="px-4 py-2.5 text-slate-500">{row.human}</td>
                      <td className="px-4 py-2.5">
                        <Badge className="bg-emerald-100 text-emerald-700">{row.ai}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 text-center">
              <Button size="sm" className="h-8 text-xs" onClick={() => setTab("Conversation AI")}>
                Começar
              </Button>
            </div>
          </div>
        )}

        {tab === "IA de voz" && (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">IA de voz</h1>
            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:max-w-xl">
              <KpiCard label="Chamadas atendidas" value="128" delta={14.2} />
              <KpiCard label="Duração média" value="2m 41s" hint="Últimos 30 dias" />
            </div>
            <div className="max-w-xl rounded-xl border bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                  <Mic className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Configuração do agente de voz</h2>
                  <p className="text-[11px] text-slate-400">Atende ligações e agenda compromissos por telefone.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs">Nome do agente de voz</Label>
                  <Input defaultValue="Laura — Recepção" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Voz</Label>
                  <Select value={voice} onValueChange={(v) => v && setVoice(v)}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue>{voice}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Feminina" className="text-xs">Feminina</SelectItem>
                      <SelectItem value="Masculina" className="text-xs">Masculina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número vinculado</Label>
                  <Input defaultValue="+55 21 3828-0872" className="h-8 text-sm" />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-xs font-medium text-slate-700">Atender fora do horário comercial</p>
                    <p className="text-[11px] text-slate-400">A IA assume as ligações quando ninguém estiver disponível.</p>
                  </div>
                  <Switch checked={afterHours} onCheckedChange={setAfterHours} />
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={() => toast.success("Configuração salva (sessão)")}>
                  Salvar configuração
                </Button>
              </div>
            </div>
          </>
        )}

        {tab === "Base de Conhecimento" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Base de Conhecimento</h1>
                <p className="text-xs text-slate-500">
                  Fontes usadas pelos agentes de IA para responder com informações da sua empresa.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => toast.info("Adição de fontes chega com o backend")}>
                + Adicionar fonte
              </Button>
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Nome</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Tamanho</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Adicionado em</th>
                  </tr>
                </thead>
                <tbody>
                  {KNOWLEDGE_SOURCES.map((s) => (
                    <tr key={s.name} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-medium text-slate-800">
                          <FileText className="size-3.5 text-slate-400" />
                          {s.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{s.type}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{s.size}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn(s.status === "Indexado" && "bg-emerald-100 text-emerald-700")}
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{s.added}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "Modelos de agente" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Modelos de agente</h1>
            <p className="mb-4 text-xs text-slate-500">
              Comece com um modelo pronto e personalize a personalidade e as metas depois.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {AGENT_TEMPLATES.map((t) => (
                <div key={t.name} className="flex flex-col rounded-xl border bg-white p-4">
                  <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                    <Sparkles className="size-4" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="mt-1 flex-1 text-xs text-slate-500">{t.description}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 text-xs"
                    onClick={() => toast.info("Uso de modelos chega com o backend")}
                  >
                    Usar modelo
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "Content AI" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Content AI</h1>
            <p className="mb-4 text-xs text-slate-500">
              Gere textos de marketing e vendas prontos para usar nos seus canais.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">O que você quer criar?</Label>
                    <Textarea
                      value={contentPrompt}
                      onChange={(e) => setContentPrompt(e.target.value)}
                      placeholder="Ex.: um texto convidando leads para testar o CRM por 7 dias grátis"
                      className="min-h-24 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Formato</Label>
                    <Select value={contentFormat} onValueChange={(v) => v && setContentFormat(v)}>
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue>{contentFormat}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(CONTENT_SAMPLES).map((f) => (
                          <SelectItem key={f} value={f} className="text-xs">
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setContentResult(CONTENT_SAMPLES[contentFormat])}
                  >
                    <Sparkles className="size-3.5" /> Gerar
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-700">Resultado</h2>
                {contentResult ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {contentResult}
                  </p>
                ) : (
                  <p className="rounded-lg border border-dashed p-6 text-center text-xs text-slate-400">
                    O conteúdo gerado aparecerá aqui.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "Logs" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Logs de atividade da IA</h1>
            <p className="mb-4 text-xs text-slate-500">
              Últimos eventos executados pelos seus agentes de IA.
            </p>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Data/hora</th>
                    <th className="px-4 py-2.5 font-medium">Agente</th>
                    <th className="px-4 py-2.5 font-medium">Contato</th>
                    <th className="px-4 py-2.5 font-medium">Evento</th>
                    <th className="px-4 py-2.5 font-medium">Canal</th>
                  </tr>
                </thead>
                <tbody>
                  {AI_LOGS.map((log, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-slate-500">{log.at}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{log.agent}</td>
                      <td className="px-4 py-2.5 text-slate-600">{log.contact}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn(
                            log.event === "Resposta enviada" && "bg-emerald-100 text-emerald-700",
                            log.event === "Transferido p/ humano" && "bg-amber-100 text-amber-700"
                          )}
                        >
                          {log.event}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{log.channel}</td>
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
