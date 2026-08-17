"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappActions } from "@/lib/data/repos/db/whatsapp";

/**
 * O QR da Evolution expira em segundos — sem redesenhar, a pessoa aponta a
 * câmera pra um código morto e acha que o produto está quebrado. Por isso
 * este componente refaz o pedido de QR sozinho enquanto o estado não vira
 * "open", mas com TETO: 15 tentativas a cada 20s (~5 minutos). Sem teto, um
 * `useEffect` que se reagenda vira laço infinito e trava a página.
 */
const MAX_TENTATIVAS = 15;
const INTERVALO_MS = 20_000;

function qrSrc(qrBase64: string): string {
  return qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`;
}

interface Props {
  /** Reconectar um canal existente — reusa a instância, não cria outra. */
  channelId?: string;
  /** Criar um canal novo — nome exigido quando `channelId` não é passado. */
  nome?: string;
  onConectado?: () => void;
}

export function ConectarEvolution({ channelId, nome, onConectado }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<string>("connecting");
  const [erro, setErro] = useState<string | null>(null);
  const [tentativas, setTentativas] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const canalIdRef = useRef(channelId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function buscar(tentativaAtual: number) {
      const res = await whatsappActions.conectarEvolution(
        canalIdRef.current ? { channelId: canalIdRef.current } : { nome },
      );
      if (cancelado) return;

      if (!res.ok) {
        setErro(res.error);
        return;
      }

      canalIdRef.current = res.channelId;
      setQr(res.qrBase64);
      setState(res.state);
      setErro(null);

      if (res.state === "open") {
        whatsappActions.refresh();
        onConectado?.();
        return; // conectou — para de buscar
      }

      const proxima = tentativaAtual + 1;
      setTentativas(proxima);
      if (proxima >= MAX_TENTATIVAS) {
        setErro("O código expirou várias vezes sem ser escaneado. Tente de novo.");
        return;
      }
      timerRef.current = setTimeout(() => void buscar(proxima), INTERVALO_MS);
    }

    void buscar(0);

    return () => {
      cancelado = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Deps só [retryKey]: o efeito reinicia quando o botão "gerar novo código"
    // muda a chave, nunca sozinho (sem isso viraria laço).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const tentarNovamente = () => {
    setErro(null);
    setTentativas(0);
    setRetryKey((k) => k + 1);
  };

  if (state === "open") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm font-semibold text-slate-900">WhatsApp conectado</p>
        <p className="text-xs text-slate-500">O canal já está pronto para atender.</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6 text-center">
        <p className="text-xs text-red-600">{erro}</p>
        <Button size="sm" className="h-8 text-xs" onClick={tentarNovamente}>
          <RefreshCcw className="size-3.5" />
          Gerar novo código
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6 text-center">
      {qr ? (
        <img
          src={qrSrc(qr)}
          alt="QR code do WhatsApp"
          className="size-48 rounded-lg border"
        />
      ) : (
        <div className="flex size-48 items-center justify-center rounded-lg border bg-slate-50">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      )}
      <p className="text-xs text-slate-500">
        Abra o WhatsApp no celular, toque em Aparelhos conectados e escaneie o código.
      </p>
      <p className="text-[10px] text-slate-400">
        Atualizando automaticamente ({tentativas}/{MAX_TENTATIVAS})
      </p>
    </div>
  );
}
