"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGuruIntegration } from "@/lib/data/repos/db/payments";
import { useWhatsappChannels } from "@/lib/data/repos/db/whatsapp";

/**
 * Só integrações que existem de fato, com o estado lido do banco. Antes esta
 * tela listava Meta Ads / Stripe / Google Analytics / Zapier com selo
 * "Conectado" fixo no código — nenhuma delas existe no projeto, e o botão
 * só emitia um toast.
 *
 * Cada card leva para onde a integração é realmente configurada, em vez de
 * duplicar a configuração aqui.
 */
export default function IntegracoesPage() {
  const { guru, loaded: guruLoaded } = useGuruIntegration();
  const { channels, ready: waReady } = useWhatsappChannels();

  const items = [
    {
      name: "Digital Manager Guru",
      desc: "Vendas e assinaturas — webhook + sincronização a cada minuto",
      href: "/pagamentos",
      status: !guruLoaded ? null : guru.connected,
    },
    {
      name: "WhatsApp",
      desc: "API oficial da Meta (Cloud API) para conversas e templates",
      href: "/whatsapp",
      status: !waReady ? null : channels.length > 0,
    },
    {
      name: "E-mail (Resend)",
      desc: "Convites de equipe e campanhas de e-mail marketing",
      href: "/configuracoes/email",
      status: null,
    },
  ];

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-slate-900">Integrações</h1>
      <p className="mb-5 text-xs text-slate-500">
        Serviços externos ligados ao CRM. Cada um é configurado no próprio módulo.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link
            key={i.name}
            href={i.href}
            className="flex flex-col rounded-xl border bg-white p-4 hover:border-indigo-300"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                {i.name[0]}
              </span>
              {i.status === true && <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>}
              {i.status === false && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-500">
                  Não conectado
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-800">{i.name}</p>
            <p className="mt-0.5 flex-1 text-[11px] text-slate-500">{i.desc}</p>
            <span className="mt-3 flex items-center gap-1 text-[11px] font-medium text-indigo-600">
              Abrir configuração <ArrowRight className="size-3" />
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        Sincronização com Google Calendar, Meta Ads e outras plataformas ainda não foi implementada.
      </p>
    </div>
  );
}
