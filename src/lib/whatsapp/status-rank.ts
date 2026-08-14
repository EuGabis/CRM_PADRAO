export type WaStatus = "sent" | "delivered" | "read" | "failed";

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

export function rankOf(status: string | null): number {
  return status ? RANK[status] ?? 0 : 0;
}

/** failed sempre registra; senão só avança para status mais alto. */
export function isAdvance(current: string | null, next: string): boolean {
  if (next === "failed") return true;
  return rankOf(next) > rankOf(current);
}
