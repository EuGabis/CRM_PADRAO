import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { BotaoSair } from "@/components/shared/botao-sair";
import { brand } from "@/lib/config/brand";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Fora de (app) de propósito: o layout de (app) é quem redireciona para cá
 * quando a empresa está suspensa. Se esta tela ficasse dentro de (app), o
 * próprio redirect disparia de novo ao renderizá-la — laço infinito.
 */
export default async function SuspensaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: susp, error: suspError } = await supabase.rpc("my_suspension");
  if (suspError) {
    console.error("[SuspensaPage] my_suspension() falhou para o usuário", user.id, suspError);
  }
  // Sem linha = sem vínculo com empresa nenhuma = não suspenso. Não faz
  // sentido mostrar esta tela para quem não está de fato suspenso. Mas se o
  // RPC falhou, não temos como saber — nesse caso é mais seguro permanecer
  // aqui do que mandar de volta pro CRM (e arriscar um pingue-pongue com o
  // shell, que também pode estar vendo o mesmo erro intermitente).
  const linha = Array.isArray(susp) ? susp[0] : susp;
  if (!suspError && !linha?.suspended) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-amber-100">
          <AlertTriangle className="size-5 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Acesso suspenso</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          O acesso da sua empresa ao {brand.name} está temporariamente suspenso.
        </p>
        {linha?.reason && (
          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Motivo
            </p>
            <p className="mt-1 text-sm text-amber-900">{linha.reason}</p>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-500">
          Fale com o suporte para regularizar o acesso.
        </p>
        <div className="mt-6 border-t pt-4">
          <BotaoSair />
        </div>
      </div>
    </div>
  );
}
