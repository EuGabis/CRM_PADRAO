"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useWhatsappChannels, whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { CreateTemplateDialog } from "./create-template-dialog";

interface Row { id?: string; name: string; language: string; status: string; category: string }

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado", PENDING: "Pendente", REJECTED: "Rejeitado",
};

export function TemplatesTab() {
  const { channels, ready } = useWhatsappChannels();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // auto-seleciona o primeiro canal
  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);

  const load = async (id: string) => {
    setLoading(true);
    const list = await whatsappActions.listAllTemplates(id);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    if (channelId) void load(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const remove = async (name: string) => {
    if (!channelId) return;
    const res = await whatsappActions.deleteTemplate(channelId, name);
    if (res.ok) {
      toast.success("Template excluído");
      void load(channelId);
    } else {
      toast.error(res.error ?? "Não foi possível excluir");
    }
  };

  if (ready && !channels.length) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Nenhum canal"
        description="Cadastre um canal de WhatsApp para gerenciar templates."
      />
    );
  }

  const selected = channels.find((c) => c.id === channelId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={channelId ?? ""} onValueChange={(v) => setChannelId(v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue>{selected?.name ?? "Selecione o canal"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {channelId && <CreateTemplateDialog channelId={channelId} onCreated={() => void load(channelId)} />}
      </div>

      <div className="rounded-xl border bg-white">
        {loading ? (
          <p className="p-4 text-xs text-slate-500">Carregando templates...</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Nenhum template neste canal.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Idioma</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.name}-${t.language}`} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-800">{t.name}</td>
                  <td className="px-3 py-2 text-slate-600">{t.category}</td>
                  <td className="px-3 py-2 text-slate-600">{t.language}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_STYLE[t.status] ?? "bg-slate-100 text-slate-600"}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(t.name)}
                      className="text-slate-400 hover:text-rose-600" title="Excluir">
                      <Trash2 className="size-4" />
                    </button>
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
