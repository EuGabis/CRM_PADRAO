import { processDueRuns } from "@/lib/automations/engine";

/** Nunca cachear: a rota é o batimento do motor. */
export const dynamic = "force-dynamic";

/**
 * Batimento do motor de automações.
 *
 * Chamada a cada minuto pelo `pg_cron` (via `pg_net`) com o cabeçalho
 * `x-automation-secret`. Sem o segredo correto responde 401 — a rota
 * roda com a service role e não pode ficar aberta.
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

  try {
    const result = await processDueRuns();
    return Response.json(result);
  } catch (error) {
    console.error("[automacoes] falha no tick:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "erro inesperado" },
      { status: 500 },
    );
  }
}
