/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mapeamento Guru -> nossas tabelas, com os nomes de campo confirmados na
 * referência oficial (api.docs.digitalmanager.guru — specs de
 * referencia-api/transactions.yaml, referencia-api/subscriptions.yaml e
 * webhooks/vendas.yaml, webhooks/assinaturas.yaml). Usado tanto pelo
 * webhook (/api/webhooks/guru) quanto pelo job de sincronização
 * (/api/integrations/guru/sync) — o formato de "Transaction"/"Subscription"
 * é o mesmo dos dois lados, com uma exceção: datas vêm como unix timestamp
 * na API REST e como string ISO no webhook (parseGuruDate cobre os dois).
 *
 * Pegadinha da própria Guru: dentro de uma Subscription "solta" (lista da
 * API ou webhook de assinatura), `id` costuma ser o uuid interno e
 * `subscription_code` o código "sub_...". Mas dentro do objeto `subscription`
 * aninhado em uma Transaction, é o contrário: `id` é o código "sub_..." e
 * `internal_id` é o uuid. pickSubscriptionIdentity lida com os dois casos
 * (e com o webhook de assinatura, que tem os dois: `id` com código e
 * `internal_id` com o uuid).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

/** Unix timestamp (REST) ou string ISO (webhook) -> ISO 8601, ou null. */
export function parseGuruDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const d = new Date(value * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function pickSubscriptionIdentity(sub: any): { externalId: string; code: string | null } {
  const uuid = firstDefined(sub?.internal_id, isUuid(sub?.id) ? sub.id : null);
  const code = firstDefined(sub?.subscription_code, !isUuid(sub?.id) ? sub?.id : null);
  return { externalId: uuid ?? code ?? crypto.randomUUID(), code };
}

export interface PaymentEventRow {
  external_id: string;
  code: string | null;
  event_type: string;
  status: string | null;
  amount: number | null;
  currency: string;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  guru_created_at: string | null;
  guru_updated_at: string | null;
  raw: unknown;
}

/** `txn` é o corpo do webhook de venda OU um item de /api/v2/transactions — mesmo shape. */
export function mapGuruTransaction(txn: any): PaymentEventRow {
  return {
    external_id: firstDefined(txn?.id) ?? crypto.randomUUID(),
    code: firstDefined(txn?.payment?.marketplace_id),
    event_type: "venda",
    status: firstDefined(txn?.status),
    amount: typeof txn?.payment?.total === "number" ? txn.payment.total : null,
    currency: firstDefined(txn?.payment?.currency) ?? "BRL",
    contact_name: firstDefined(txn?.contact?.name),
    contact_email: firstDefined(txn?.contact?.email),
    product_name: firstDefined(txn?.product?.name),
    guru_created_at: parseGuruDate(
      firstDefined(txn?.dates?.created_at, txn?.dates?.ordered_at)
    ),
    guru_updated_at: parseGuruDate(txn?.dates?.updated_at),
    raw: txn,
  };
}

export interface PaymentSubscriptionRow {
  external_id: string;
  code: string | null;
  status: string | null;
  amount: number | null;
  currency: string;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  guru_started_at: string | null;
  guru_updated_at: string | null;
  charged_times: number | null;
  charged_every_days: number | null;
  next_cycle_at: string | null;
  raw: unknown;
}

/** `sub` é o corpo do webhook de assinatura OU um item de /api/v2/subscriptions — mesmo shape (com pequenas diferenças de nomes tratadas abaixo). */
export function mapGuruSubscription(sub: any): PaymentSubscriptionRow {
  const { externalId, code } = pickSubscriptionIdentity(sub);
  return {
    external_id: externalId,
    code,
    status: firstDefined(sub?.last_status),
    amount:
      typeof sub?.last_transaction?.payment?.total === "number"
        ? sub.last_transaction.payment.total
        : null,
    currency: "BRL",
    contact_name: firstDefined(sub?.contact?.name, sub?.subscriber?.name),
    contact_email: firstDefined(sub?.contact?.email, sub?.subscriber?.email),
    product_name: firstDefined(sub?.product?.name, sub?.name),
    guru_started_at: parseGuruDate(firstDefined(sub?.started_at, sub?.dates?.started_at)),
    guru_updated_at: parseGuruDate(
      firstDefined(sub?.updated_at, sub?.dates?.last_status_at, sub?.last_status_at)
    ),
    charged_times: typeof sub?.charged_times === "number" ? sub.charged_times : null,
    charged_every_days:
      typeof sub?.charged_every_days === "number" ? sub.charged_every_days : null,
    next_cycle_at: firstDefined(sub?.next_cycle_at, sub?.dates?.next_cycle_at),
    raw: sub,
  };
}

/** Extrai a assinatura aninhada de um webhook/registro de venda, se houver. */
export function extractNestedSubscription(txn: any): any | null {
  return txn?.subscription ?? null;
}
