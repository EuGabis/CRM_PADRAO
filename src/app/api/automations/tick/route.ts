import { processDueRuns } from "@/lib/automations/engine";
import { dispatchScheduledMessages } from "@/lib/messages/scheduled";

/** Nunca cachear: a rota é o batimento do motor. */
export const dynamic = "force-dynamic";

/**
 * Batimento de minuto do servidor.
 *
 * Chamada a cada minuto pelo `pg_cron` (via `pg_net`) com o cabeçalho
 * `x-automation-secret`. Sem o segredo correto responde 401 — a rota
 * roda com a service role e não pode ficar aberta.
 *
 * Faz duas coisas, no mesmo tique: executa os runs de automação vencidos e
 * dispara as mensagens agendadas que chegaram a hora (migração 0028). São
 * independentes — uma falhar não impede a outra.
 */
export async function POST(request: Request) {
  const expected = process.env.AUTOMATION_SECRET;
  if (!expected) {
    return Response.json(
      { error: "motor não configurado (AUTOMATION_SECRET ausente)" },
      { status: 503 },
    );
  }

  const secret = request.headers.get("x-automation-secret");
  if (!secret || secret !== expected) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  const [automations, scheduled] = await Promise.allSettled([
    processDueRuns(),
    dispatchScheduledMessages(),
  ]);

  if (automations.status === "rejected") {
    console.error("[automacoes] falha no tick:", automations.reason);
  }
  if (scheduled.status === "rejected") {
    console.error("[agendadas] falha no disparo:", scheduled.reason);
  }

  if (automations.status === "rejected" && scheduled.status === "rejected") {
    return Response.json(
      {
        error:
          automations.reason instanceof Error ? automations.reason.message : "erro inesperado",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ...(automations.status === "fulfilled"
      ? automations.value
      : { processed: 0, errors: 0, tickError: true }),
    scheduled:
      scheduled.status === "fulfilled"
        ? scheduled.value
        : { dispatched: 0, failed: 0, tickError: true },
  });
}
