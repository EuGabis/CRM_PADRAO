import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

export default function ConfigWhatsappPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">WhatsApp</h1>
      <p className="mb-5 text-xs text-slate-500">
        A gestão de números, instâncias e templates fica no módulo WhatsApp.
      </p>
      <Link
        href="/whatsapp"
        className="flex items-center justify-between rounded-xl border bg-white p-5 hover:border-indigo-300"
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <MessageCircle className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">Abrir módulo WhatsApp</span>
            <span className="block text-[11px] text-slate-500">
              API oficial (Meta) e instâncias via QR Code
            </span>
          </span>
        </span>
        <ArrowRight className="size-4 text-slate-400" />
      </Link>
    </div>
  );
}
