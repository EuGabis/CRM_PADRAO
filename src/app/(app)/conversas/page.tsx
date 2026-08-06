"use client";

import { useMemo, useState } from "react";
import { Link2, Phone, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { Composer } from "@/components/inbox/composer";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { ConversationList } from "@/components/inbox/conversation-list";
import { Thread } from "@/components/inbox/thread";
import { ViewsRail } from "@/components/inbox/views-rail";
import { DataTable, type Column } from "@/components/shared/data-table";
import { KpiCard } from "@/components/shared/kpi-card";
import { ChannelIcon, channelLabel } from "@/components/shared/channel-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContacts, contactName } from "@/lib/data/repos/contacts";
import { useConversation, useConversations } from "@/lib/data/repos/conversations";
import { brand } from "@/lib/config/brand";
import type { Channel } from "@/lib/data/types";

const TABS = [
  { label: "Conversas" },
  { label: "Ações manuais" },
  { label: "Trechos" },
  { label: "Links de acionamento" },
  { label: "Estatísticas" },
  { label: "Configurações" },
];

export default function ConversasPage() {
  const [tab, setTab] = useState("Conversas");
  const conversations = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const selectedConversation = useConversation(selectedId);

  return (
    <div className="flex h-full flex-col">
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      {tab !== "Conversas" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {tab === "Ações manuais" && <AcoesManuaisTab />}
          {tab === "Trechos" && <TrechosTab />}
          {tab === "Links de acionamento" && <LinksTab />}
          {tab === "Estatísticas" && <EstatisticasTab />}
          {tab === "Configurações" && <ConfiguracoesTab />}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ViewsRail />
          <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Thread conversationId={selectedId} />
              <Composer conversationId={selectedId} />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-slate-50">
              <p className="text-sm text-slate-400">Selecione uma conversa</p>
            </div>
          )}
          {selectedConversation && <ContactPanel contactId={selectedConversation.contactId} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Ações manuais ---------- */

interface ManualAction {
  id: string;
  contato: string;
  tipo: "Telefone" | "SMS";
  fluxo: string;
  criadoEm: string;
}

const MANUAL_FLOWS = [
  "Boas-vindas Teste Grátis",
  "Follow-up Demo",
  "Reativação de inativos",
  "Cobrança amigável",
];

const MANUAL_DATES = [
  "05 ago 2026 09:12",
  "05 ago 2026 10:40",
  "04 ago 2026 16:25",
  "04 ago 2026 11:03",
  "03 ago 2026 18:47",
  "03 ago 2026 14:15",
  "02 ago 2026 09:58",
];

function AcoesManuaisTab() {
  const contacts = useContacts();
  const rows = useMemo<ManualAction[]>(
    () =>
      contacts.slice(0, 7).map((c, i) => ({
        id: `ma-${i + 1}`,
        contato: contactName(c),
        tipo: i % 2 === 0 ? "Telefone" : "SMS",
        fluxo: MANUAL_FLOWS[i % MANUAL_FLOWS.length],
        criadoEm: MANUAL_DATES[i % MANUAL_DATES.length],
      })),
    [contacts]
  );

  const columns: Column<ManualAction>[] = [
    {
      key: "contato",
      header: "Contato",
      sortable: true,
      sortValue: (r) => r.contato,
      render: (r) => <span className="font-medium text-slate-800">{r.contato}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      sortable: true,
      sortValue: (r) => r.tipo,
      render: (r) => (
        <span className="flex items-center gap-1.5 text-slate-600">
          {r.tipo === "Telefone" ? (
            <Phone className="size-3.5 text-indigo-500" />
          ) : (
            <Smartphone className="size-3.5 text-slate-500" />
          )}
          {r.tipo}
        </span>
      ),
    },
    { key: "fluxo", header: "Fluxo de origem", render: (r) => <span className="text-slate-600">{r.fluxo}</span> },
    { key: "criado", header: "Criado em", sortable: true, sortValue: (r) => r.criadoEm, render: (r) => <span className="text-slate-500">{r.criadoEm}</span> },
    {
      key: "acao",
      header: "",
      render: () => (
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            toast.info("Iniciar ação manual chega com o backend");
          }}
        >
          Iniciar
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-900">Ações manuais</h1>
        <Badge variant="secondary">{rows.length} pendentes</Badge>
      </div>
      <DataTable data={rows} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Trechos ---------- */

interface Snippet {
  id: string;
  nome: string;
  atalho: string;
  conteudo: string;
  canal: Channel;
}

const SNIPPETS: Snippet[] = [
  { id: "sn-1", nome: "Tabela de preços", atalho: "/precos", conteudo: "Olá! Nossos planos começam em R$ 97/mês no plano Essencial, com automações e caixa de entrada unificada…", canal: "whatsapp" },
  { id: "sn-2", nome: "Link da demo", atalho: "/demo", conteudo: "Perfeito! Você pode agendar uma demonstração ao vivo com nosso time neste link: agenda…", canal: "whatsapp" },
  { id: "sn-3", nome: "Boas-vindas Instagram", atalho: "/bemvindo", conteudo: "Oi! Que bom ter você por aqui 💜 Me conta: você já usa algum CRM hoje ou faz tudo manualmente?", canal: "instagram" },
  { id: "sn-4", nome: "Fora do horário", atalho: "/ausente", conteudo: "Nosso atendimento funciona de seg. a sex., das 8h às 20h. Deixe sua mensagem que respondemos assim que possível!", canal: "sms" },
  { id: "sn-5", nome: "Proposta por e-mail", atalho: "/proposta", conteudo: "Conforme conversamos, segue em anexo a proposta comercial com as condições especiais válidas até o fim do mês…", canal: "email" },
];

function TrechosTab() {
  const columns: Column<Snippet>[] = [
    { key: "nome", header: "Nome", sortable: true, sortValue: (r) => r.nome, render: (r) => <span className="font-medium text-slate-800">{r.nome}</span> },
    {
      key: "atalho",
      header: "Atalho",
      render: (r) => (
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600">{r.atalho}</code>
      ),
    },
    {
      key: "conteudo",
      header: "Conteúdo",
      render: (r) => (
        <span className="block max-w-md truncate text-slate-500">{r.conteudo}</span>
      ),
    },
    {
      key: "canal",
      header: "Canal",
      render: (r) => (
        <span className="flex items-center gap-1.5 text-slate-600">
          <ChannelIcon channel={r.canal} size={16} /> {channelLabel(r.canal)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900">Trechos</h1>
          <Badge variant="secondary">{SNIPPETS.length} trechos</Badge>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de trechos chega com o backend")}>
          <Plus className="size-3.5" /> Novo trecho
        </Button>
      </div>
      <DataTable data={SNIPPETS} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Links de acionamento ---------- */

interface TriggerLink {
  id: string;
  nome: string;
  url: string;
  cliques: number;
  criadoEm: string;
}

const linkBase = `${brand.shortName.toLowerCase()}.link`;

const TRIGGER_LINKS: TriggerLink[] = [
  { id: "tl-1", nome: "Teste grátis 14 dias", url: `${linkBase}/teste-gratis`, cliques: 482, criadoEm: "12 jun 2026" },
  { id: "tl-2", nome: "Agendar demonstração", url: `${linkBase}/demo`, cliques: 217, criadoEm: "03 jul 2026" },
  { id: "tl-3", nome: "Promoção de inverno", url: `${linkBase}/inverno26`, cliques: 139, criadoEm: "15 jul 2026" },
  { id: "tl-4", nome: "Grupo VIP WhatsApp", url: `${linkBase}/vip`, cliques: 96, criadoEm: "01 ago 2026" },
];

function LinksTab() {
  const columns: Column<TriggerLink>[] = [
    { key: "nome", header: "Nome", sortable: true, sortValue: (r) => r.nome, render: (r) => <span className="font-medium text-slate-800">{r.nome}</span> },
    {
      key: "url",
      header: "URL",
      render: (r) => (
        <span className="flex items-center gap-1.5 text-indigo-600">
          <Link2 className="size-3.5" /> {r.url}
        </span>
      ),
    },
    { key: "cliques", header: "Cliques", sortable: true, sortValue: (r) => r.cliques, render: (r) => <span className="text-slate-700">{r.cliques.toLocaleString("pt-BR")}</span> },
    { key: "criado", header: "Criado em", sortable: true, sortValue: (r) => r.criadoEm, render: (r) => <span className="text-slate-500">{r.criadoEm}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900">Links de acionamento</h1>
          <Badge variant="secondary">{TRIGGER_LINKS.length} links</Badge>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de links de acionamento chega com o backend")}>
          <Plus className="size-3.5" /> Criar link
        </Button>
      </div>
      <DataTable data={TRIGGER_LINKS} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Estatísticas ---------- */

const ALL_CHANNELS: Channel[] = ["whatsapp", "instagram", "facebook", "sms", "email"];

function EstatisticasTab() {
  const conversations = useConversations();

  const porCanal = useMemo(() => {
    const counts: Record<Channel, number> = { whatsapp: 0, instagram: 0, facebook: 0, sms: 0, email: 0 };
    conversations.forEach((c) => {
      counts[c.channel] += 1;
    });
    return counts;
  }, [conversations]);

  const abertas = conversations.length;
  const slaEstourado = useMemo(() => conversations.filter((c) => c.slaDays > 0).length, [conversations]);

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">Estatísticas de conversas</h1>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tempo médio de resposta" value="4m 12s" delta={-18} />
        <KpiCard label="Conversas abertas" value={String(abertas)} delta={6} />
        <KpiCard label="Resolvidas hoje" value="9" delta={12} />
        <KpiCard label="SLA estourado" value={String(slaEstourado)} hint="Conversas sem resposta acima do SLA alvo" />
      </div>
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">Conversas por canal</p>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {ALL_CHANNELS.map((ch) => {
              const count = porCanal[ch];
              const pct = abertas > 0 ? Math.round((count / abertas) * 100) : 0;
              return (
                <tr key={ch} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <ChannelIcon channel={ch} size={18} /> {channelLabel(ch)}
                    </span>
                  </td>
                  <td className="w-40 px-4 py-2.5">
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{count}</td>
                  <td className="w-16 px-4 py-2.5 text-right text-slate-400">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Configurações ---------- */

function ConfiguracoesTab() {
  const [notificacoes, setNotificacoes] = useState(true);
  const [atribuicao, setAtribuicao] = useState(true);
  const [respostaAuto, setRespostaAuto] = useState(false);
  const [marcarLida, setMarcarLida] = useState(true);
  const [slaAlvo, setSlaAlvo] = useState("4");

  const toggles = [
    {
      label: "Notificações de novas mensagens",
      description: "Receber alerta no navegador quando uma conversa chegar",
      value: notificacoes,
      set: setNotificacoes,
    },
    {
      label: "Atribuição automática",
      description: "Distribuir novas conversas entre a equipe (round-robin)",
      value: atribuicao,
      set: setAtribuicao,
    },
    {
      label: "Resposta automática fora do horário",
      description: "Enviar mensagem padrão fora do horário comercial",
      value: respostaAuto,
      set: setRespostaAuto,
    },
    {
      label: "Marcar como lida ao abrir",
      description: "Zerar contador de não lidas ao visualizar a conversa",
      value: marcarLida,
      set: setMarcarLida,
    },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-lg font-bold text-slate-900">Configurações da caixa de entrada</h1>
      <div className="rounded-xl border bg-white">
        {toggles.map((t) => (
          <div key={t.label} className="flex items-center justify-between gap-4 border-b px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-slate-800">{t.label}</p>
              <p className="text-xs text-slate-500">{t.description}</p>
            </div>
            <Switch
              checked={t.value}
              onCheckedChange={(v) => {
                t.set(Boolean(v));
                toast.info("Persistência das configurações chega com o backend");
              }}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-slate-800">SLA alvo de primeira resposta</p>
            <p className="text-xs text-slate-500">Tempo máximo antes de sinalizar a conversa como atrasada</p>
          </div>
          <Select value={slaAlvo} onValueChange={(v) => v && setSlaAlvo(v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue>{`${slaAlvo} hora${slaAlvo === "1" ? "" : "s"}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["1", "2", "4", "8", "24"].map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h} hora{h === "1" ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
