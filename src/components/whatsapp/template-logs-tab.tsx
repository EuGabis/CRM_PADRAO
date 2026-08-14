"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useWhatsappChannels, useTemplateLogs } from "@/lib/data/repos/db/whatsapp";

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-slate-100 text-slate-600",
  delivered: "bg-sky-100 text-sky-700",
  read: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<string, string> = {
  sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou",
};

const fmt = (iso: string | null) =>
  iso ? format(new Date(iso), "dd/MM HH:mm", { locale: ptBR }) : "—";

export function TemplateLogsTab() {
  const { channels, ready } = useWhatsappChannels();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const { logs } = useTemplateLogs(channelId);
  const filtered = useMemo(
    () => (statusFilter === "all" ? logs : logs.filter((l) => l.status === statusFilter)),
    [logs, statusFilter],
  );

  if (ready && !channels.length) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Nenhum canal"
        description="Cadastre um canal para ver o rastreio de templates."
      />
    );
  }
  const selected = channels.find((c) => c.id === channelId);
  const FILTERS = [["all","Todos"],["sent","Enviado"],["delivered","Entregue"],["read","Lido"],["failed","Falhou"]] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Select value={channelId ?? ""} onValueChange={(v) => setChannelId(v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue>{selected?.name ?? "Selecione o canal"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue>{FILTERS.find(([v]) => v === statusFilter)?.[1] ?? "Todos"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(([v, l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Nenhum envio de template ainda.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Enviado</th>
                <th className="px-3 py-2 font-medium">Entregue</th>
                <th className="px-3 py-2 font-medium">Lido</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-slate-800">{l.contactName}</td>
                  <td className="px-3 py-2 text-slate-600">{l.templateName}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.deliveredAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{fmt(l.readAt)}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_STYLE[l.status ?? ""] ?? "bg-slate-100 text-slate-600"}>
                      {STATUS_LABEL[l.status ?? ""] ?? l.status ?? "—"}
                    </Badge>
                    {l.status === "failed" && l.errorDetail && (
                      <span className="ml-2 text-[10px] text-rose-500">{l.errorDetail}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
