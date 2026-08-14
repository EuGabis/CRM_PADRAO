/**
 * Vocabulário de status da Guru — confirmado na referência oficial da API
 * (api.docs.digitalmanager.guru/openapi/listas-auxiliares/status-vendas.yaml
 * e .../status-assinaturas.yaml). Rótulos em pt-BR copiados de lá, para bater
 * com o que o usuário já vê no próprio painel da Guru.
 */
export type GuruStatusCategory =
  | "aprovado"
  | "pendente"
  | "recusado"
  | "reembolsado"
  | "chargeback"
  | "atrasado"
  | "cancelado"
  | "expirado"
  | "desconhecido";

const SALE_STATUS: Record<string, { category: GuruStatusCategory; label: string }> = {
  approved: { category: "aprovado", label: "Aprovada" },
  completed: { category: "aprovado", label: "Completa" },
  trial: { category: "aprovado", label: "Trial" },
  started: { category: "aprovado", label: "Iniciada" },
  pending: { category: "pendente", label: "Pendente" },
  waiting_payment: { category: "pendente", label: "Ag. Pagamento" },
  billet_printed: { category: "pendente", label: "Boleto Impresso" },
  charging: { category: "pendente", label: "A Processar Pagamento" },
  processing: { category: "pendente", label: "Em Processamento" },
  analysis: { category: "pendente", label: "Em Análise" },
  scheduled: { category: "pendente", label: "Agendada" },
  in_recovery: { category: "pendente", label: "Em Recuperação" },
  pending_transfer: { category: "pendente", label: "Transferência Pendente" },
  transferred: { category: "aprovado", label: "Transferido" },
  rejected: { category: "recusado", label: "Rejeitada" },
  blocked: { category: "recusado", label: "Bloqueada" },
  failed: { category: "recusado", label: "Erro na Transferência" },
  abandoned: { category: "recusado", label: "Abandonada" },
  refunded: { category: "reembolsado", label: "Reembolsada" },
  dispute: { category: "reembolsado", label: "Reembolso Sol." },
  chargeback: { category: "chargeback", label: "Reclamada" },
  delayed: { category: "atrasado", label: "Atrasada" },
  canceled: { category: "cancelado", label: "Cancelada" },
  expired: { category: "expirado", label: "Expirada" },
};

const SUBSCRIPTION_STATUS: Record<string, { category: GuruStatusCategory; label: string }> = {
  active: { category: "aprovado", label: "Ativa" },
  started: { category: "aprovado", label: "Iniciada" },
  trial: { category: "aprovado", label: "Trial" },
  pastdue: { category: "atrasado", label: "Atrasada" },
  inactive: { category: "cancelado", label: "Inativa" },
  canceled: { category: "cancelado", label: "Cancelada" },
  expired: { category: "expirado", label: "Expirada" },
};

/** Opções de status para os filtros — mesma ordem/rótulo do painel da Guru. */
export const SALE_STATUS_OPTIONS = Object.entries(SALE_STATUS).map(([value, v]) => ({
  value,
  label: v.label,
  category: v.category,
}));

export const SUBSCRIPTION_STATUS_OPTIONS = Object.entries(SUBSCRIPTION_STATUS).map(
  ([value, v]) => ({ value, label: v.label, category: v.category })
);

function lookup(raw: string | null | undefined) {
  if (!raw) return undefined;
  const key = raw.toLowerCase();
  return SALE_STATUS[key] ?? SUBSCRIPTION_STATUS[key];
}

/** Categoria usada para cor do badge e para agrupar KPIs (aprovado/atrasado/cancelado...). */
export function classifyGuruStatus(raw: string | null | undefined): GuruStatusCategory {
  return lookup(raw)?.category ?? "desconhecido";
}

/** Rótulo pt-BR igual ao do painel da Guru — cai no valor bruto se for um status novo/desconhecido. */
export function guruStatusLabel(raw: string | null | undefined): string {
  return lookup(raw)?.label ?? raw ?? "—";
}
