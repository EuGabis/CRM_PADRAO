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
