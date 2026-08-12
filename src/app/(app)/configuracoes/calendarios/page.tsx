import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * O módulo Calendários é real (compromissos no banco, repo db/appointments),
 * mas não existe conexão com Google Calendar nem preferências persistidas de
 * duração/buffer. Antes esta tela mostrava uma conta Google "Conectada"
 * (gustavo@litocrm.com.br — inventada) e dois selects que não salvavam nada.
 */
export default function ConfigCalendariosPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold text-slate-900">Calendários</h1>
      <p className="mb-5 text-xs text-slate-500">Conexões e preferências de agendamento da conta.</p>
      <EmptyState
        icon={CalendarClock}
        title="Sem contas de calendário conectadas"
        description="A sincronização com Google Calendar ainda não foi implementada. Os compromissos criados no CRM ficam apenas aqui, no módulo Calendários."
      />
      <Link
        href="/calendarios"
        className="mt-3 flex items-center justify-between rounded-xl border bg-white p-4 text-xs hover:border-indigo-300"
      >
        <span className="font-medium text-slate-700">Abrir módulo Calendários</span>
        <ArrowRight className="size-4 text-slate-400" />
      </Link>
    </div>
  );
}
