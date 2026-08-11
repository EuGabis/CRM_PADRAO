"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SubNav } from "@/components/layout/subnav";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { Users2, UserPlus, Radar, BarChart3 } from "lucide-react";
import { useContacts, contactName } from "@/lib/data/repos/contacts";
import { formatBRL } from "@/lib/data/repos/opportunities";
import {
  paymentsActions,
  useGuruIntegration,
  usePaymentEvents,
  usePaymentSubscriptions,
  usePaymentsRealtimeStatus,
  type PaymentEvent,
  type PaymentSubscription,
} from "@/lib/data/repos/db/payments";
import { useMyMembership } from "@/lib/data/repos/db/team";
import { classifyGuruStatus, guruStatusLabel } from "@/lib/data/guru";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Integrações" },
  { label: "Arquivos e contratos" },
  { label: "Vendas" },
  { label: "Assinaturas" },
  { label: "Contatos" },
  { label: "Leads" },
  { label: "Produtos" },
  { label: "R.P.P.C." },
  { label: "Relatórios" },
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

/* ------------------------------- Guru (real) ----------------------------- */

function GuruProviderCard() {
  const { guru, loaded } = useGuruIntegration();
  const { isAdmin } = useMyMembership();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
          G
        </span>
        {loaded && guru.connected && (
          <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-800">Guru</p>
      <p className="mt-1 flex-1 text-[11px] text-slate-500">
        Checkout, vendas e assinaturas da Digital Manager Guru — sincronizado a cada minuto.
      </p>
      {!loaded ? (
        <p className="mt-1 text-[10px] text-slate-400">Verificando conexão...</p>
      ) : (
        guru.connected && (
          <p className="mt-1 text-[10px] text-slate-400">
            {guru.lastSyncedAt
              ? `Última sincronização: ${format(new Date(guru.lastSyncedAt), "dd MMM, HH:mm:ss", { locale: ptBR })}`
              : "Aguardando a primeira sincronização (roda a cada minuto)..."}
          </p>
        )
      )}
      <Button
        variant={loaded && guru.connected ? "outline" : "default"}
        size="sm"
        className="mt-3 h-7 text-xs"
        disabled={!loaded}
        onClick={() => {
          if (!isAdmin) {
            toast.info("Apenas administradores podem configurar integrações de pagamento");
            return;
          }
          setOpen(true);
        }}
      >
        {!loaded ? "..." : guru.connected ? "Gerenciar" : "Conectar"}
      </Button>
      <GuruDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function GuruDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { guru } = useGuruIntegration();
  const [apiKey, setApiKey] = useState(guru.apiKey);
  const [webhookToken, setWebhookToken] = useState(guru.webhookToken);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (open) {
      setApiKey(guru.apiKey);
      setWebhookToken(guru.webhookToken);
      setOrigin(window.location.origin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const webhookUrl = origin ? `${origin}/api/webhooks/guru` : "";

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const save = async () => {
    if (!webhookToken.trim()) {
      toast.error("Cole o Account Token (api_token) mostrado no painel da Guru");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Cole o User Token — sem ele a sincronização de 1 minuto não funciona");
      return;
    }
    setSaving(true);
    const res = await paymentsActions.saveGuruCredentials({ apiKey, webhookToken });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível salvar");
      return;
    }
    toast.success("Guru conectada");
    onOpenChange(false);
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar a Guru? Os eventos já recebidos continuam salvos.")) return;
    const ok = await paymentsActions.disconnectGuru();
    if (ok) {
      toast.success("Guru desconectada");
      onOpenChange(false);
    } else {
      toast.error("Não foi possível desconectar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar com a Guru</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">URL do webhook</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="h-8 font-mono text-[11px]" />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => copy(webhookUrl, "URL")}
              >
                Copiar
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              Cole esta URL no painel da Guru em Configurações → Webhook.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Account Token (api_token do webhook) *</Label>
            <Input
              key={open ? "open" : "closed"}
              value={webhookToken}
              onChange={(e) => setWebhookToken(e.target.value)}
              placeholder="Painel da Guru → Minha Conta → API"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-8 font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400">
              A Guru envia esse valor em todo webhook — usamos para confirmar que o evento é
              mesmo dela e identificar sua empresa.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User Token (para sincronizar vendas/assinaturas) *</Label>
            <Input
              key={open ? "open" : "closed"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Painel da Guru → Meu Perfil → Tokens API"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-8 font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400">
              {guru.apiKey
                ? `Token salvo: ${"•".repeat(Math.max(0, guru.apiKey.length - 4))}${guru.apiKey.slice(-4)}`
                : "Nenhum token salvo ainda."}{" "}
              Sem ele, a sincronização automática de 1 minuto não roda — só os webhooks recebidos.
            </p>
          </div>
        </div>
        <DialogFooter>
          {guru.connected && (
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={disconnect}>
              Desconectar
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function guruStatusBadgeClass(status: string | null): string {
  switch (classifyGuruStatus(status)) {
    case "aprovado":
      return "bg-emerald-100 text-emerald-700";
    case "pendente":
    case "atrasado":
      return "bg-amber-100 text-amber-700";
    case "recusado":
    case "reembolsado":
    case "chargeback":
    case "cancelado":
    case "expirado":
      return "bg-red-100 text-red-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function GuruStatusBadge({ status }: { status: string | null }) {
  return (
    <Badge variant="secondary" className={cn(guruStatusBadgeClass(status))}>
      {guruStatusLabel(status)}
    </Badge>
  );
}

/** Aberto por "Ver payload" nas tabelas alimentadas pela Guru — mostra o JSON bruto. */
function RawPayloadDialog({
  raw,
  onClose,
}: {
  raw: Record<string, unknown> | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!raw} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payload recebido da Guru</DialogTitle>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700">
          {raw ? JSON.stringify(raw, null, 2) : ""}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function RawPayloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="text-[11px] font-medium text-indigo-600 hover:underline"
      onClick={onClick}
    >
      Ver payload
    </button>
  );
}

function GuruLiveBadge() {
  const realtime = usePaymentsRealtimeStatus();
  if (realtime !== "on") return null;
  return <Badge className="bg-emerald-100 text-emerald-700">● Ao vivo</Badge>;
}

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

function statusBadgeClass(status: string) {
  switch (status) {
    case "Pago":
    case "Paga":
    case "Concluído":
    case "Ativa":
    case "Ativo":
      return "bg-emerald-100 text-emerald-700";
    case "Pendente":
    case "Enviada":
    case "Processando":
      return "bg-amber-100 text-amber-700";
    case "Reembolsado":
    case "Vencida":
    case "Inadimplente":
    case "Expirado":
      return "bg-red-100 text-red-600";
    case "Cancelada":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn(statusBadgeClass(status))}>
      {status}
    </Badge>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {action && (
        <Button size="sm" className="h-8 text-xs" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b text-[11px] text-slate-400">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b last:border-0">
              {cells.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-4 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useClienteNome() {
  const contacts = useContacts();
  return useMemo(
    () => (i: number) =>
      contacts.length > 0 ? contactName(contacts[i % contacts.length]) : "Cliente",
    [contacts]
  );
}

/* ------------------------------- Pagamentos ------------------------------ */

function TransacoesTab() {
  const { guru, loaded } = useGuruIntegration();
  if (!loaded) return null;
  return guru.connected ? <TransacoesGuruTab /> : <TransacoesMockTab />;
}

function TransacoesMockTab() {
  const nome = useClienteNome();
  const rows = useMemo(
    () => [
      { cliente: nome(0), metodo: "Pix", valor: 147, status: "Pago", data: "06 ago 2026" },
      { cliente: nome(3), metodo: "Cartão", valor: 197, status: "Pago", data: "05 ago 2026" },
      { cliente: nome(5), metodo: "Boleto", valor: 97, status: "Pendente", data: "05 ago 2026" },
      { cliente: nome(8), metodo: "Cartão", valor: 1470, status: "Pago", data: "04 ago 2026" },
      { cliente: nome(11), metodo: "Pix", valor: 147, status: "Reembolsado", data: "03 ago 2026" },
      { cliente: nome(14), metodo: "Cartão", valor: 147, status: "Pago", data: "02 ago 2026" },
      { cliente: nome(16), metodo: "Pix", valor: 297, status: "Pago", data: "01 ago 2026" },
      { cliente: nome(19), metodo: "Boleto", valor: 147, status: "Reembolsado", data: "31 jul 2026" },
    ],
    [nome]
  );
  return (
    <>
      <SectionHeader
        title="Vendas"
        subtitle="Transações processadas pelos provedores conectados"
        action="Registrar pagamento"
        onAction={() => toast.info("Registro manual de pagamento chega com o backend")}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Receita do mês" value="R$ 12.480,00" delta={12} />
        <KpiCard label="Transações" value="94" delta={8} />
        <KpiCard label="Ticket médio" value="R$ 132,77" delta={-2} />
        <KpiCard label="Reembolsos" value="R$ 294,00" hint="2 transações reembolsadas" />
      </div>
      <MiniTable
        headers={["Cliente", "Método", "Valor", "Status", "Data"]}
        rows={rows.map((r) => [
          <span key="c" className="font-medium text-slate-800">{r.cliente}</span>,
          <span key="m" className="text-slate-600">{r.metodo}</span>,
          <span key="v" className="font-semibold text-slate-800">{formatBRL(r.valor)}</span>,
          <StatusBadge key="s" status={r.status} />,
          <span key="d" className="text-slate-500">{r.data}</span>,
        ])}
      />
    </>
  );
}

function TransacoesGuruTab() {
  const events = usePaymentEvents();
  const [rawEvent, setRawEvent] = useState<PaymentEvent | null>(null);

  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = events.filter((e) => {
      if (!e.guruCreatedAt) return false;
      const d = new Date(e.guruCreatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const approved = thisMonth.filter((e) => classifyGuruStatus(e.status) === "aprovado");
    const revenue = approved.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const refunded = events.filter((e) =>
      ["reembolsado", "chargeback"].includes(classifyGuruStatus(e.status))
    );
    const refundTotal = refunded.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    return {
      revenue,
      count: approved.length,
      ticket: approved.length ? revenue / approved.length : 0,
      refundTotal,
      refundCount: refunded.length,
    };
  }, [events]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Vendas</h1>
          <p className="text-xs text-slate-500">Vendas sincronizadas da Guru (webhook + API)</p>
        </div>
        <GuruLiveBadge />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Receita do mês" value={formatBRL(kpis.revenue)} />
        <KpiCard label="Vendas aprovadas (mês)" value={String(kpis.count)} />
        <KpiCard label="Ticket médio" value={formatBRL(kpis.ticket)} />
        <KpiCard
          label="Reembolsos / chargebacks"
          value={formatBRL(kpis.refundTotal)}
          hint={`${kpis.refundCount} transações`}
        />
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-xs text-slate-400">
          Nenhuma venda sincronizada ainda. A primeira sincronização roda no próximo minuto após
          conectar — as vendas aparecem aqui automaticamente.
        </div>
      ) : (
        <MiniTable
          headers={["Código", "Contato", "Produto", "Criada em", "Status", "Valor", ""]}
          rows={events.map((e) => [
            <span key="cd" className="font-mono text-[11px] text-slate-500">{e.code ?? "—"}</span>,
            <span key="c" className="text-slate-600">{e.contactName ?? e.contactEmail ?? "—"}</span>,
            <span key="p" className="text-slate-600">{e.productName ?? "—"}</span>,
            <span key="d" className="text-slate-500">
              {e.guruCreatedAt ? format(new Date(e.guruCreatedAt), "dd MMM yyyy, HH:mm", { locale: ptBR }) : "—"}
            </span>,
            <GuruStatusBadge key="s" status={e.status} />,
            <span key="v" className="font-semibold text-slate-800">
              {e.amount !== null ? formatBRL(e.amount) : "—"}
            </span>,
            <RawPayloadButton key="raw" onClick={() => setRawEvent(e)} />,
          ])}
        />
      )}
      <RawPayloadDialog raw={rawEvent?.raw ?? null} onClose={() => setRawEvent(null)} />
    </>
  );
}

/* ------------------------------- Assinaturas ----------------------------- */

function AssinaturasTab() {
  const { guru, loaded } = useGuruIntegration();
  if (!loaded) return null;
  return guru.connected ? <AssinaturasGuruTab /> : <AssinaturasMockTab />;
}

function AssinaturasMockTab() {
  const nome = useClienteNome();
  const rows = useMemo(
    () => [
      { cliente: nome(0), plano: "Mensal — R$ 147,00", status: "Ativa", proxima: "01 set 2026" },
      { cliente: nome(3), plano: "Anual — R$ 1.470,00", status: "Ativa", proxima: "04 mar 2027" },
      { cliente: nome(5), plano: "Mensal — R$ 147,00", status: "Inadimplente", proxima: "28 jul 2026" },
      { cliente: nome(8), plano: "Mensal — R$ 147,00", status: "Ativa", proxima: "15 ago 2026" },
      { cliente: nome(11), plano: "Anual — R$ 1.470,00", status: "Ativa", proxima: "10 jan 2027" },
      { cliente: nome(14), plano: "Mensal — R$ 147,00", status: "Cancelada", proxima: "—" },
    ],
    [nome]
  );
  return (
    <>
      <SectionHeader
        title="Assinaturas"
        subtitle="Cobranças recorrentes ativas, inadimplentes e canceladas"
        action="+ Nova assinatura"
        onAction={() => toast.info("Criação de assinaturas chega com o backend")}
      />
      <MiniTable
        headers={["Cliente", "Plano", "Status", "Próxima cobrança"]}
        rows={rows.map((r) => [
          <span key="c" className="font-medium text-slate-800">{r.cliente}</span>,
          <span key="p" className="text-slate-600">{r.plano}</span>,
          <StatusBadge key="s" status={r.status} />,
          <span key="d" className="text-slate-500">{r.proxima}</span>,
        ])}
      />
    </>
  );
}

function AssinaturasGuruTab() {
  const subscriptions = usePaymentSubscriptions();
  const [rawSub, setRawSub] = useState<PaymentSubscription | null>(null);

  const counts = useMemo(() => {
    const byCategory = { ativa: 0, atrasado: 0, cancelado: 0, outro: 0 };
    for (const s of subscriptions) {
      const cat = classifyGuruStatus(s.status);
      if (cat === "aprovado") byCategory.ativa++;
      else if (cat === "atrasado") byCategory.atrasado++;
      else if (cat === "cancelado" || cat === "expirado") byCategory.cancelado++;
      else byCategory.outro++;
    }
    return byCategory;
  }, [subscriptions]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Assinaturas</h1>
          <p className="text-xs text-slate-500">Estado atual de cada assinante da Guru</p>
        </div>
        <GuruLiveBadge />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ativas" value={String(counts.ativa)} />
        <KpiCard label="Atrasadas" value={String(counts.atrasado)} />
        <KpiCard label="Canceladas / expiradas" value={String(counts.cancelado)} />
        <KpiCard label="Total de assinantes" value={String(subscriptions.length)} />
      </div>
      {subscriptions.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-xs text-slate-400">
          Nenhuma assinatura sincronizada ainda. A primeira sincronização roda no próximo minuto
          após conectar — as assinaturas aparecem aqui automaticamente.
        </div>
      ) : (
        <MiniTable
          headers={["Código", "Contato", "Produto", "Iniciada em", "Atualizada em", "Status", "Qtd cobranças", "Cobrada a cada", ""]}
          rows={subscriptions.map((s) => [
            <span key="cd" className="font-mono text-[11px] text-slate-500">{s.code ?? "—"}</span>,
            <span key="c" className="font-medium text-slate-800">
              {s.contactName ?? s.contactEmail ?? "—"}
            </span>,
            <span key="p" className="text-slate-600">{s.productName ?? "—"}</span>,
            <span key="i" className="text-slate-500">
              {s.guruStartedAt ? format(new Date(s.guruStartedAt), "dd MMM yyyy, HH:mm", { locale: ptBR }) : "—"}
            </span>,
            <span key="d" className="text-slate-500">
              {s.guruUpdatedAt ? format(new Date(s.guruUpdatedAt), "dd MMM yyyy, HH:mm", { locale: ptBR }) : "—"}
            </span>,
            <GuruStatusBadge key="s" status={s.status} />,
            <span key="qt" className="text-slate-600">{s.chargedTimes ?? "—"}</span>,
            <span key="ce" className="text-slate-600">
              {s.chargedEveryDays !== null ? `${s.chargedEveryDays} dias` : "—"}
            </span>,
            <RawPayloadButton key="raw" onClick={() => setRawSub(s)} />,
          ])}
        />
      )}
      <RawPayloadDialog raw={rawSub?.raw ?? null} onClose={() => setRawSub(null)} />
    </>
  );
}

/* -------------------------------- Produtos ------------------------------- */

const PRODUTOS_MOCK = [
  { nome: "Plano Mensal", desc: "Acesso completo à plataforma com cobrança mensal.", preco: 147, tipo: "Recorrente", ativo: true },
  { nome: "Plano Anual", desc: "12 meses com 2 meses de desconto na adesão.", preco: 1470, tipo: "Recorrente", ativo: true },
  { nome: "Implementação", desc: "Setup assistido: funis, automações e integrações.", preco: 2000, tipo: "Único", ativo: true },
  { nome: "Curso CRM na Prática", desc: "Treinamento gravado para o time comercial.", preco: 297, tipo: "Único", ativo: true },
];

function ProdutosTab() {
  const { guru, loaded } = useGuruIntegration();
  if (!loaded) return null;
  return guru.connected ? <ProdutosGuruTab /> : <ProdutosMockTab />;
}

function ProdutosMockTab() {
  return (
    <>
      <SectionHeader
        title="Produtos"
        subtitle="Catálogo usado em faturas, links de pagamento e checkout"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PRODUTOS_MOCK.map((p) => (
          <div key={p.nome} className="flex flex-col rounded-xl border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                {p.tipo}
              </Badge>
              {p.ativo && <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>}
            </div>
            <p className="text-sm font-semibold text-slate-800">{p.nome}</p>
            <p className="mt-1 flex-1 text-[11px] text-slate-500">{p.desc}</p>
            <p className="mt-3 text-lg font-bold text-slate-900">
              {formatBRL(p.preco)}
              {p.tipo === "Recorrente" && (
                <span className="text-[11px] font-medium text-slate-400">
                  {p.preco >= 1000 ? "/ano" : "/mês"}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

interface GuruProductRow {
  id: string;
  name: string;
  type: string;
  is_hidden?: number;
  marketplace_name?: string;
  group?: { name?: string };
  created_at?: number;
}

function ProdutosGuruTab() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    products: GuruProductRow[];
  }>({ loading: true, error: null, products: [] });

  useEffect(() => {
    let active = true;
    fetch("/api/integrations/guru/products")
      .then(async (res) => {
        const json = await res.json();
        if (!active) return;
        if (!res.ok) {
          setState({ loading: false, error: json.error ?? "Falha ao carregar produtos", products: [] });
          return;
        }
        setState({ loading: false, error: null, products: json.products ?? [] });
      })
      .catch((e) => {
        if (active) setState({ loading: false, error: e instanceof Error ? e.message : "Falha ao carregar", products: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <SectionHeader title="Produtos" subtitle="Catálogo de produtos da Guru (GET /api/v2/products)" />
      {state.loading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-xs text-slate-400">
          Carregando produtos da Guru...
        </div>
      ) : state.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-xs text-red-600">
          {state.error}
        </div>
      ) : state.products.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-xs text-slate-400">
          Nenhum produto encontrado na conta da Guru.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {state.products.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                  {p.type === "plan" ? "Assinatura" : "Produto"}
                </Badge>
                {p.is_hidden ? (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-500">Oculto</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700">Visível</Badge>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800">{p.name}</p>
              <p className="mt-1 flex-1 text-[11px] text-slate-500">
                {p.group?.name ?? "Sem grupo"} · {p.marketplace_name ?? "—"}
              </p>
              <p className="mt-3 text-[11px] text-slate-400">
                {p.created_at
                  ? `Criado em ${format(new Date(p.created_at * 1000), "dd MMM yyyy", { locale: ptBR })}`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------- Placeholders ---------------------------- */

function ContatosTab() {
  return (
    <EmptyState
      icon={Users2}
      title="Contatos da Guru"
      description="Lista de contatos vindos da API da Guru (GET /api/v2/contacts) — ainda não conectada. Conte pra gente se quer isso antes das outras abas."
    />
  );
}

function LeadsTab() {
  return (
    <EmptyState
      icon={UserPlus}
      title="Leads da Guru"
      description="Leads capturados na Guru (formulários, checkouts abandonados) — integração ainda não construída."
    />
  );
}

function RPPCTab() {
  return (
    <EmptyState
      icon={Radar}
      title="R.P.P.C."
      description="Rastreamento de campanhas, checkouts, grupos e custo de tráfego da Guru — o domínio mais complexo dos que faltam, com vários sub-recursos na API. Ainda não construído."
    />
  );
}

function RelatoriosTab() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Relatórios"
      description="Relatórios consolidados de vendas e assinaturas da Guru — ainda não construído."
    />
  );
}

/* ---------------------------------- Page --------------------------------- */

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
              <GuruProviderCard />
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
        ) : tab === "Vendas" ? (
          <TransacoesTab />
        ) : tab === "Assinaturas" ? (
          <AssinaturasTab />
        ) : tab === "Contatos" ? (
          <ContatosTab />
        ) : tab === "Leads" ? (
          <LeadsTab />
        ) : tab === "Produtos" ? (
          <ProdutosTab />
        ) : tab === "R.P.P.C." ? (
          <RPPCTab />
        ) : (
          <RelatoriosTab />
        )}
      </div>
    </div>
  );
}
