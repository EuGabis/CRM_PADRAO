/**
 * Cliente da OpenAI (Chat Completions). SERVER-ONLY: usa OPENAI_API_KEY, que nunca
 * pode ir ao cliente. Modelo configurável por OPENAI_MODEL (default gpt-4o-mini).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export function defaultModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

/**
 * Allowlist de modelos, aplicada NO SERVIDOR. `ai_agents.model` é escrito pelo
 * cliente num campo de texto livre na tela do agente — validar só na tela não
 * protege nada, porque a API pode ser chamada direto. E quem paga a conta é o
 * dono da plataforma: um `gpt-4o` digitado ali multiplicaria por dezenas o
 * custo de CADA auto-resposta (que roda sozinha, por mensagem recebida, hoje
 * com imagem anexada). Modelo fora da lista cai no default — nunca recusa a
 * resposta, só troca o modelo. Só modelos baratos entram aqui; ao adicionar
 * um novo, lembre que ele passa a ser gasto de todo cliente liberado.
 */
const MODELOS_PERMITIDOS = new Set(["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano"]);

export function modeloPermitido(model?: string | null): string {
  const m = String(model ?? "").trim();
  return m && MODELOS_PERMITIDOS.has(m) ? m : defaultModel();
}

/**
 * Erro da OpenAI carregando o status HTTP. Quem chama precisa distinguir cota
 * estourada (429 — derruba TODAS as empresas ao mesmo tempo, porque a chave é
 * global) de chave inválida (401) ou erro do modelo (400). O corpo da resposta
 * NUNCA é logado por quem trata isso: pode ecoar trecho do prompt.
 */
export class OpenAIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenAIError";
    this.status = status;
  }
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY ausente no servidor");
  return k;
}

type ParteConteudo =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type MensagemChat = {
  role: "system" | "user" | "assistant";
  content: string | ParteConteudo[];
};

export async function chat(
  messages: MensagemChat[],
  opts?: { model?: string; temperature?: number; maxTokens?: number; json?: boolean },
): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Sempre pela allowlist: o modelo chega de `ai_agents.model`, que o
      // cliente digita. Ver MODELOS_PERMITIDOS.
      model: modeloPermitido(opts?.model),
      messages,
      temperature: opts?.temperature ?? 0.7,
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new OpenAIError(res.status, json?.error?.message || `OpenAI ${res.status}`);
  }
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  const usage = json?.usage ?? {};
  return {
    text,
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    },
  };
}
