"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle } from "lucide-react";
import { useWhatsappChannels, whatsappActions, type WhatsappChannel } from "@/lib/data/repos/db/whatsapp";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConectarEvolution } from "@/components/whatsapp/conectar-evolution";

function ConnectionBadge({ c }: { c: WhatsappChannel }) {
  if (c.provider !== "evolution") {
    return <span className="text-slate-400">—</span>;
  }
  if (c.connectionState === "open") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        Conectado
      </span>
    );
  }
  if (c.connectionState === "connecting") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        Conectando…
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        Desconectado
      </span>
      {c.disconnectedAt && (
        <span className="text-[10px] text-slate-400">
          desde {formatDistanceToNow(new Date(c.disconnectedAt), { locale: ptBR, addSuffix: true })}
        </span>
      )}
    </span>
  );
}

export function ChannelsTable() {
  const { channels, ready } = useWhatsappChannels();
  const [reconectando, setReconectando] = useState<WhatsappChannel | null>(null);

  if (ready && channels.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Nenhum canal de atendimento"
        description="Cadastre um número do WhatsApp para começar a atender."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-slate-50 text-left text-slate-500">
            <tr>
              {["Canal", "Nome na Meta", "Número", "Status", "Conexão", "Setor", "Limite diário", "Bot", "Coexistência", "Criado em"].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-semibold text-slate-800">{c.name}</td>
                <td className="px-3 py-2 text-slate-600">{c.metaName || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{c.phoneE164 || "—"}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => whatsappActions.toggleActive(c.id, !c.active)}
                    className={
                      c.active
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                    }
                  >
                    {c.active ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ConnectionBadge c={c} />
                    {c.provider === "evolution" && c.connectionState !== "open" && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-6 text-[10px]"
                        onClick={() => setReconectando(c)}
                      >
                        Reconectar
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{c.sector || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{c.dailyLimit}</td>
                <td className="px-3 py-2 text-slate-400">—</td>
                <td className="px-3 py-2 text-slate-400">—</td>
                <td className="px-3 py-2 text-slate-500">
                  {format(new Date(c.createdAt), "d MMM yyyy", { locale: ptBR })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={reconectando !== null} onOpenChange={(v) => !v && setReconectando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reconectar {reconectando?.name}</DialogTitle>
          </DialogHeader>
          {reconectando && (
            <ConectarEvolution
              channelId={reconectando.id}
              onConectado={() => setReconectando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
