/** Ações que um passo de workflow pode executar. */
export type ActionKey =
  | "adicionar-tag"
  | "remover-tag"
  | "atualizar-campo"
  | "atribuir-usuario"
  | "criar-oportunidade"
  | "mover-fase"
  | "criar-tarefa"
  | "criar-compromisso"
  | "enviar-email"
  | "nota-interna"
  | "esperar"
  | "condicao"
  | "webhook"
  | "enviar-whatsapp"
  | "enviar-sms";

/** Um passo do workflow, como fica salvo em `workflows.steps` (jsonb). */
export interface Step {
  key: ActionKey;
  config: Record<string, unknown>;
}

/** Contexto de uma execução, montado pelo motor a partir de `automation_runs`. */
export interface RunContext {
  runId: string;
  locationId: string;
  contactId: string | null;
  opportunityId: string | null;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  status: "ok" | "skipped" | "error";
  message?: string;
  /** ISO — coloca o run em `waiting` até essa data (ação "esperar"). */
  waitUntil?: string;
  /** Índice do passo para onde pular. Negativo = encerrar o run com sucesso. */
  jumpTo?: number;
}

/** Teto de passos por run — trava de segurança contra workflow em loop. */
export const MAX_STEPS_PER_RUN = 50;

/** Espera entre novas tentativas, por número de falhas já acumuladas. */
export const RETRY_DELAYS_MINUTES = [1, 5, 15];

/** Converte o jsonb cru de `workflows.steps` em passos válidos. */
export function parseSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { key?: unknown; config?: unknown };
    if (typeof candidate.key !== "string") return [];
    return [
      {
        key: candidate.key as ActionKey,
        config:
          candidate.config && typeof candidate.config === "object"
            ? (candidate.config as Record<string, unknown>)
            : {},
      },
    ];
  });
}
