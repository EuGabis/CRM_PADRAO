/**
 * Transcritor de áudio via Whisper. SERVER-ONLY: usa OPENAI_API_KEY, que nunca
 * pode ir ao cliente nem aparecer em log — mesma regra de `lib/ai/openai.ts`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OPENAI_AUDIO_URL = "https://api.openai.com/v1/audio/transcriptions";

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY ausente no servidor");
  return k;
}

/**
 * Transcreve os bytes de um áudio para texto. Lança em falha — quem chama
 * trata (na auto-resposta, falha de transcrição vira "mídia não
 * interpretada", nunca quebra a resposta).
 */
export async function transcreverAudio(bytes: ArrayBuffer, nomeArquivo: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes]), nomeArquivo);
  form.append("model", "whisper-1");

  const res = await fetch(OPENAI_AUDIO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
    },
    body: form,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI ${res.status}`);
  }
  return String(json?.text ?? "");
}
