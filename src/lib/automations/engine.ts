import { createAdminClient } from "@/lib/supabase/admin";
import { runAction } from "./actions";
import {
  MAX_STEPS_PER_RUN,
  RETRY_DELAYS_MINUTES,
  parseSteps,
  type RunContext,
  type Step,
} from "./types";

type Db = ReturnType<typeof createAdminClient>;

interface RunRow {
  id: string;
  location_id: string;
  workflow_id: string;
  contact_id: string | null;
  opportunity_id: string | null;
  status: string;
  current_step: number;
  attempts: number;
  payload: Record<string, unknown> | null;
}

/** Grava uma linha em `automation_logs`; falha de log nunca derruba o run. */
async function log(
  db: Db,
  run: RunRow,
  stepIndex: number,
  actionKey: string,
  status: "ok" | "skipped" | "error",
  message: string | undefined,
  durationMs: number,
) {
  await db.from("automation_logs").insert({
    location_id: run.location_id,
    run_id: run.id,
    step_index: stepIndex,
    action_key: actionKey,
    status,
    message: message?.slice(0, 1000) ?? null,
    duration_ms: durationMs,
  });
}

async function finish(
  db: Db,
  runId: string,
  patch: Record<string, unknown>,
) {
  await db
    .from("automation_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Reagenda com backoff (1/5/15 min) ou marca `failed` após 3 tentativas. */
async function handleFailure(db: Db, run: RunRow, stepIndex: number, error: string) {
  const attempts = run.attempts + 1;
  const delay = RETRY_DELAYS_MINUTES[attempts - 1];

  if (delay === undefined) {
    await finish(db, run.id, {
      status: "failed",
      attempts,
      current_step: stepIndex,
      last_error: error.slice(0, 1000),
    });
    return;
  }

  await finish(db, run.id, {
    status: "pending",
    attempts,
    current_step: stepIndex,
    last_error: error.slice(0, 1000),
    next_run_at: new Date(Date.now() + delay * 60_000).toISOString(),
  });
}

/** Executa um run a partir de `current_step`. */
async function processRun(db: Db, run: RunRow, steps: Step[]) {
  const ctx: RunContext = {
    runId: run.id,
    locationId: run.location_id,
    contactId: run.contact_id,
    opportunityId: run.opportunity_id,
    payload: run.payload ?? {},
  };

  let index = run.current_step;
  let executed = 0;

  while (index < steps.length) {
    if (executed >= MAX_STEPS_PER_RUN) {
      await finish(db, run.id, {
        status: "failed",
        current_step: index,
        last_error: `Limite de ${MAX_STEPS_PER_RUN} passos por execução atingido`,
      });
      return;
    }

    const step = steps[index];
    const startedAt = Date.now();

    let result;
    try {
      result = await runAction(step, ctx);
    } catch (error) {
      result = {
        status: "error" as const,
        message: error instanceof Error ? error.message : "Erro inesperado na ação",
      };
    }

    const durationMs = Date.now() - startedAt;
    executed += 1;
    await log(db, run, index, step.key, result.status, result.message, durationMs);

    if (result.status === "error") {
      await handleFailure(db, run, index, result.message ?? "Erro na ação");
      return;
    }

    // Espera: sai do laço e volta no próximo tick, já no passo seguinte.
    if (result.waitUntil) {
      await finish(db, run.id, {
        status: "waiting",
        current_step: index + 1,
        attempts: 0,
        next_run_at: result.waitUntil,
      });
      return;
    }

    // Condição não atendida sem ramo alternativo encerra o run.
    if (typeof result.jumpTo === "number") {
      if (result.jumpTo < 0 || result.jumpTo >= steps.length) break;
      index = result.jumpTo;
      continue;
    }

    index += 1;
  }

  await finish(db, run.id, {
    status: "done",
    current_step: index,
    attempts: 0,
    last_error: null,
  });
}

/**
 * Processa a fila de automações: pega os runs vencidos, executa os passos
 * e devolve quantos foram processados. Chamado pela rota `/api/automations/tick`.
 */
export async function processDueRuns(limit = 25): Promise<{ processed: number; errors: number }> {
  const db = createAdminClient();
  let processed = 0;
  let errors = 0;

  const { data, error } = await db
    .from("automation_runs")
    .select(
      "id, location_id, workflow_id, contact_id, opportunity_id, status, current_step, attempts, payload",
    )
    .in("status", ["pending", "waiting"])
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Não foi possível ler a fila: ${error.message}`);

  const runs = (data ?? []) as RunRow[];

  for (const run of runs) {
    // Marca como `running` condicionando ao status lido: se outro tick já
    // pegou este run, o update não afeta linha nenhuma e nós pulamos.
    const { data: claimed } = await db
      .from("automation_runs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", run.status)
      .select("id");

    if (!claimed || claimed.length === 0) continue;

    try {
      const { data: workflow } = await db
        .from("workflows")
        .select("steps, status")
        .eq("id", run.workflow_id)
        .maybeSingle();

      const wf = workflow as { steps: unknown; status: string } | null;

      if (!wf || wf.status !== "published") {
        await finish(db, run.id, {
          status: "cancelled",
          last_error: "Workflow removido ou despublicado",
        });
        continue;
      }

      const steps = parseSteps(wf.steps);
      if (steps.length === 0) {
        await finish(db, run.id, { status: "done", last_error: null });
        processed += 1;
        continue;
      }

      await processRun(db, run, steps);
      processed += 1;
    } catch (error) {
      errors += 1;
      await handleFailure(
        db,
        run,
        run.current_step,
        error instanceof Error ? error.message : "Erro inesperado no motor",
      );
    }
  }

  return { processed, errors };
}
