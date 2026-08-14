"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useWhatsappChannels, whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { cn } from "@/lib/utils";

export interface BulkTarget {
  conversationId: string;
  contactName: string;
  /** null quando a conversa não é de um canal de WhatsApp conectado. */
  channelId: string | null;
}

interface Template {
  name: string;
  language: string;
  category: string;
}

/**
 * Envia um template aprovado para VÁRIAS conversas selecionadas.
 *
 * Um POST /api/whatsapp/send por conversa, em série: a rota já valida canal,
 * limite diário e grava a mensagem — replicar isso num endpoint em lote seria
 * duplicar a regra e deixar as duas versões divergirem. Em série (e não em
 * paralelo) porque estourar o limite diário do canal em rajada devolveria 429
 * pra metade da lista sem nenhum controle.
 *
 * Template é o único formato possível aqui: parte das conversas está fora da
 * janela de 24h, onde o WhatsApp não permite texto livre.
 */
export function BulkTemplateDialog({
  open,
  onOpenChange,
  targets,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targets: BulkTarget[];
  onDone?: () => void;
}) {
  const { channels } = useWhatsappChannels();
  const [channelId, setChannelId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Template | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const eligible = targets.filter((t) => !!t.channelId);
  const skipped = targets.filter((t) => !t.channelId);

  // Canal padrão: o da primeira conversa selecionada — é a lista de templates
  // que quase sempre interessa.
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setProgress(0);
    setChannelId((cur) => cur || eligible[0]?.channelId || channels[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !channelId) return;
    let active = true;
    setLoading(true);
    void whatsappActions.templates(channelId).then((t) => {
      if (!active) return;
      setTemplates(t);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, channelId]);

  const send = async () => {
    if (!picked) {
      toast.error("Escolha um template");
      return;
    }
    setSending(true);
    setProgress(0);
    let sent = 0;
    const failures: string[] = [];
    for (const t of eligible) {
      const res = await whatsappActions.send({
        conversationId: t.conversationId,
        channelId: t.channelId ?? undefined,
        template: { name: picked.name, language: picked.language },
      });
      if (res.ok) sent++;
      else failures.push(`${t.contactName}: ${res.error ?? "falha no envio"}`);
      setProgress((p) => p + 1);
    }
    setSending(false);

    if (sent > 0) {
      toast.success(`Template enviado para ${sent} conversa${sent > 1 ? "s" : ""}`);
    }
    if (failures.length > 0) {
      // Uma linha por falha (até 5) — "3 falharam" sem dizer quais obriga o
      // atendente a conferir conversa por conversa.
      toast.error(
        `${failures.length} não enviada${failures.length > 1 ? "s" : ""}:\n${failures
          .slice(0, 5)
          .join("\n")}${failures.length > 5 ? `\n… e mais ${failures.length - 5}` : ""}`,
        { duration: 12000 }
      );
    }
    if (sent > 0) {
      onDone?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Para <span className="font-semibold text-slate-700">{eligible.length}</span> conversa
            {eligible.length === 1 ? "" : "s"} selecionada{eligible.length === 1 ? "" : "s"}.
          </p>
          {skipped.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
              {skipped.length} conversa{skipped.length > 1 ? "s" : ""} fora do envio: sem canal de
              WhatsApp conectado ({skipped.slice(0, 3).map((s) => s.contactName).join(", ")}
              {skipped.length > 3 ? "…" : ""}).
            </p>
          )}
          {channels.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Número (de onde vêm os templates)</Label>
              <Select value={channelId} onValueChange={(v) => setChannelId(v ?? "")}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>
                    {channels.find((c) => c.id === channelId)?.name ?? "Selecionar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} · {c.phoneE164}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">
                Cada conversa sai pelo próprio número dela. O template precisa estar aprovado na
                WABA de cada um — em números diferentes, o envio pode falhar.
              </p>
            </div>
          )}
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {loading && <p className="p-4 text-center text-xs text-slate-400">Carregando…</p>}
            {!loading && templates.length === 0 && (
              <p className="p-4 text-center text-xs text-slate-400">
                Nenhum template aprovado nesta WABA. Crie em Canais de atendimento → Templates.
              </p>
            )}
            {templates.map((t) => (
              <button
                key={`${t.name}-${t.language}`}
                onClick={() => setPicked(t)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs hover:bg-slate-50",
                  picked?.name === t.name && picked?.language === t.language
                    ? "border-indigo-400 bg-indigo-50"
                    : ""
                )}
              >
                <span className="font-semibold text-slate-800">{t.name}</span>
                <span className="text-[10px] text-slate-400">
                  {t.language} · {t.category}
                </span>
              </button>
            ))}
          </div>
          {sending && (
            <p className="text-xs font-medium text-indigo-600">
              Enviando {progress} de {eligible.length}…
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={sending || !picked || eligible.length === 0}>
            {sending ? "Enviando..." : `Enviar para ${eligible.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
