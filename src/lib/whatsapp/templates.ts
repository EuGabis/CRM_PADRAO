export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface TemplateInput {
  name: string;
  category: TemplateCategory;
  language: string;
  bodyText: string;
  examples: string[];
}

/** Índices de {{n}} na ordem de aparição, sem repetição, ordenados. */
export function parseVariables(body: string): number[] {
  const seen = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

const CATEGORIES: TemplateCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];

/** Validação server-authority; o cliente repete por UX. */
export function validateTemplateInput(
  input: TemplateInput,
): { ok: true } | { ok: false; error: string } {
  if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
    return { ok: false, error: "Nome inválido: use minúsculas, números e _ (sem espaços)." };
  }
  if (!CATEGORIES.includes(input.category)) {
    return { ok: false, error: "Categoria inválida." };
  }
  if (!input.language.trim()) {
    return { ok: false, error: "Idioma obrigatório." };
  }
  if (!input.bodyText.trim()) {
    return { ok: false, error: "Corpo da mensagem obrigatório." };
  }
  const vars = parseVariables(input.bodyText);
  // sequenciais a partir de 1: [1,2,3...]
  const sequential = vars.every((n, i) => n === i + 1);
  if (!sequential) {
    return { ok: false, error: "Variáveis devem ser sequenciais começando em {{1}}." };
  }
  if (input.examples.length !== vars.length) {
    return { ok: false, error: "Informe um exemplo para cada variável." };
  }
  if (input.examples.some((e) => !e.trim())) {
    return { ok: false, error: "Exemplos de variável não podem ficar vazios." };
  }
  return { ok: true };
}

/** Componentes que a Graph API espera (só BODY). */
export function buildBodyComponents(bodyText: string, examples: string[]): unknown[] {
  const body: Record<string, unknown> = { type: "BODY", text: bodyText };
  if (examples.length) body.example = { body_text: [examples] };
  return [body];
}
