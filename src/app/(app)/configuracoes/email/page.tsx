import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { senderAddress, replyToAddress } from "@/lib/email/sender";

/**
 * Server component de propósito: o remetente real vem de `EMAIL_FROM` (env
 * privada, resolvida por senderAddress()), que não existe no client. Antes
 * esta tela mostrava "contato@crmon.com.br" / "mail.crmon.com.br" com
 * selo "Verificado" e um toggle de SMTP dedicado — nada disso existe: o
 * envio é todo pelo Resend e não há suporte a SMTP próprio.
 *
 * Só expõe SE a chave do Resend está configurada, nunca o valor dela.
 */
/**
 * Sem isso a página é pré-renderizada no build e congela o valor de
 * EMAIL_FROM/RESEND_API_KEY daquele momento — mudar a env na Vercel sem
 * redeploy faria esta tela mostrar um remetente diferente do que os e-mails
 * realmente usam, que é justamente o problema que ela deveria resolver.
 */
export const dynamic = "force-dynamic";

export default function EmailConfigPage() {
  const sender = senderAddress();
  const replyTo = replyToAddress();
  const resendConfigured = !!process.env.RESEND_API_KEY?.trim();
  const domain = sender?.match(/@([^\s>]+)/)?.[1] ?? null;

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Serviços de e-mail</h1>
      <p className="mb-5 text-xs text-slate-500">
        Os e-mails do CRM (convites de equipe e campanhas de marketing) saem pelo Resend.
      </p>

      <div className="mb-4 space-y-3 rounded-xl border bg-white p-5 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700">Provedor de envio</p>
            <p className="text-slate-500">Resend</p>
          </div>
          {resendConfigured ? (
            <Badge className="shrink-0 bg-emerald-100 text-emerald-700">Configurado</Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 bg-amber-100 text-amber-700">
              Sem chave de API
            </Badge>
          )}
        </div>
        <div className="border-t pt-3">
          <p className="font-semibold text-slate-700">Remetente</p>
          {sender ? (
            <p className="break-all font-mono text-[11px] text-slate-600">{sender}</p>
          ) : (
            <p className="text-[11px] text-amber-700">
              Não configurado — defina <span className="font-mono">EMAIL_FROM</span> com um
              endereço do seu domínio verificado no Resend. Sem isso, convites de equipe e
              campanhas não são enviados.
            </p>
          )}
        </div>
        {domain && (
          <div className="border-t pt-3">
            <p className="font-semibold text-slate-700">Domínio de envio</p>
            <p className="font-mono text-[11px] text-slate-600">{domain}</p>
          </div>
        )}
        <div className="border-t pt-3">
          <p className="font-semibold text-slate-700">Responder para (Reply-To)</p>
          <p className="font-mono text-[11px] text-slate-600">{replyTo ?? "não definido"}</p>
        </div>
      </div>

      <p className="mb-4 rounded-lg border bg-slate-50 p-3 text-[11px] text-slate-500">
        Remetente, domínio e chave de API são definidos pelas variáveis de ambiente{" "}
        <code>EMAIL_FROM</code>, <code>EMAIL_REPLY_TO</code> e <code>RESEND_API_KEY</code> (na Vercel
        e no <code>.env.local</code>) — não há edição por aqui. A verificação de domínio (SPF, DKIM,
        DMARC) é feita no painel do Resend.
      </p>

      <Link
        href="/marketing"
        className="flex items-center justify-between rounded-xl border bg-white p-4 text-xs hover:border-indigo-300"
      >
        <span className="font-medium text-slate-700">Criar e acompanhar campanhas de e-mail</span>
        <ArrowRight className="size-4 text-slate-400" />
      </Link>
    </div>
  );
}
