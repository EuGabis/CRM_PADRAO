"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { whatsappActions } from "@/lib/data/repos/db/whatsapp";

interface Template {
  name: string;
  language: string;
  category: string;
  components: unknown[];
}

export function TemplatePicker({
  open,
  onOpenChange,
  channelId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId: string | null;
  onPick: (t: { name: string; language: string; components?: unknown[] }) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !channelId) return;
    setLoading(true);
    void whatsappActions.templates(channelId).then((t) => {
      setTemplates(t);
      setLoading(false);
    });
  }, [open, channelId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher template</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          A janela de 24h fechou — fora dela, o WhatsApp só permite iniciar com um template aprovado.
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading && <p className="p-4 text-center text-xs text-slate-400">Carregando…</p>}
          {!loading && templates.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">
              Nenhum template aprovado nesta WABA.
            </p>
          )}
          {templates.map((t) => (
            <button
              key={`${t.name}-${t.language}`}
              onClick={() => {
                onPick({ name: t.name, language: t.language });
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-800">{t.name}</span>
              <span className="text-[10px] text-slate-400">
                {t.language} · {t.category}
              </span>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
