/**
 * Tetos de tamanho, aplicados NOS DOIS SENTIDOS (envio e recebimento).
 * São os mesmos limites do WhatsApp: aceitar acima disso seria guardar no
 * Storage — que é do dono da plataforma — um arquivo que o WhatsApp
 * recusaria adiante.
 */
export type TipoMidia = "image" | "audio" | "video" | "file";

const MB = 1024 * 1024;

export const LIMITES: Record<TipoMidia, number> = {
  image: 5 * MB,
  audio: 16 * MB,
  video: 16 * MB,
  file: 100 * MB,
};

export function tipoPorMime(mime: string): TipoMidia | null {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (!m) return null;
  return "file";
}

export function limiteExcedido(tipo: TipoMidia, bytes: number): boolean {
  return bytes > LIMITES[tipo];
}

export function rotuloLimite(tipo: TipoMidia): string {
  return `${Math.round(LIMITES[tipo] / MB)} MB`;
}

/**
 * O tamanho que a Evolution manda no payload não é número: vem como objeto
 * protobuf Long ({low, high, unsigned}) — confirmado em payload real. Comparar
 * esse objeto com um limite numérico é sempre `false`, então o limite nunca
 * pegaria. `high > 0` significa acima de 4 GB: devolve Infinity para que
 * qualquer teto seja estourado, em vez de arriscar um número errado.
 */
export function bytesDoPayload(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && valor.trim() !== "" && !Number.isNaN(Number(valor))) {
    return Number(valor);
  }
  if (
    typeof valor === "object" &&
    valor !== null &&
    "low" in valor &&
    "high" in valor
  ) {
    const { low, high } = valor as { low: unknown; high: unknown };
    if (typeof high === "number" && high > 0) return Infinity;
    return Number(low);
  }
  return null;
}
