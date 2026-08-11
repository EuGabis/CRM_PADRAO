/**
 * Cliente da API pública da Guru (api.docs.digitalmanager.guru).
 *
 * Endpoints e formato confirmados na referência oficial:
 * - Auth: header `Authorization: Bearer {user_token}` (User Token, gerado em
 *   Meu Perfil > Tokens API no painel da Guru — diferente do Account Token
 *   usado nos webhooks).
 * - Paginação por cursor: `cursor` na query, `next_cursor`/`has_more_pages`
 *   na resposta.
 * - Limite de 360 requisições/minuto por conta; 429 quando excede.
 */

const TRANSACTIONS_URL = "https://digitalmanager.guru/api/v2/transactions";
const SUBSCRIPTIONS_URL = "https://digitalmanager.guru/api/v2/subscriptions";
const PRODUCTS_URL = "https://digitalmanager.guru/api/v2/products";
const CONTACTS_URL = "https://digitalmanager.guru/api/v2/contacts";
const MAX_PAGES = 200;

export interface GuruTransaction {
  id: string;
  status: string;
  type?: string;
  contact?: { id?: string; name?: string; email?: string };
  product?: { id?: string; name?: string };
  payment?: {
    method?: string;
    total?: number;
    currency?: string;
    marketplace_id?: string;
  };
  dates?: {
    ordered_at?: number;
    confirmed_at?: number | null;
    created_at?: number;
    updated_at?: number;
    canceled_at?: number | null;
  };
  subscription?: { id?: string; subscription_code?: string };
}

export interface GuruSubscription {
  id: string;
  subscription_code: string;
  last_status: string;
  last_status_at?: number;
  started_at?: number;
  next_cycle_at?: string;
  charged_times?: number;
  charged_every_days?: number;
  created_at?: number;
  updated_at?: number;
  contact?: { id?: string; name?: string; email?: string };
  subscriber?: { id?: string; name?: string; email?: string };
  product?: { id?: string; name?: string };
  payment_method?: string;
}

export interface GuruProduct {
  id: string;
  name: string;
  type: string;
  is_hidden?: number;
  is_trackable?: number;
  marketplace_id?: string;
  marketplace_name?: string;
  group?: { id?: string; name?: string };
  producer?: { id?: string; name?: string };
  created_at?: number;
  updated_at?: number;
}

export interface GuruContact {
  id: string;
  name?: string;
  email?: string;
  doc?: string;
  phone_full_number?: string;
  phone_local_code?: string;
  phone_number?: string;
  created_at?: number;
  update_at?: number;
}

export interface GuruPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMorePages: boolean;
  totalRows: number | null;
}

type Filters = Record<string, string | string[]>;

async function guruRequest(baseUrl: string, userToken: string, params: URLSearchParams) {
  const url = `${baseUrl}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${userToken}`, Accept: "application/json" };

  let res = await fetch(url, { headers });
  if (res.status === 429) {
    const retryAfter = Math.min(Number(res.headers.get("retry-after") ?? "2") || 2, 5);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    res = await fetch(url, { headers });
  }
  if (!res.ok) {
    throw new Error(`Guru API ${res.status} em ${baseUrl}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllPages<T>(
  baseUrl: string,
  userToken: string,
  baseParams: Filters
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(baseParams)) {
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else params.set(key, value);
    }
    if (cursor) params.set("cursor", cursor);

    const json = await guruRequest(baseUrl, userToken, params);
    items.push(...(json.data ?? []));

    if (!json.has_more_pages || !json.next_cursor) break;
    cursor = json.next_cursor;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { items, truncated };
}

export function fetchGuruTransactions(userToken: string, filters: Filters) {
  return fetchAllPages<GuruTransaction>(TRANSACTIONS_URL, userToken, filters);
}

export function fetchGuruSubscriptions(userToken: string, filters: Filters) {
  return fetchAllPages<GuruSubscription>(SUBSCRIPTIONS_URL, userToken, filters);
}

export function fetchGuruProducts(userToken: string, filters: Filters = {}) {
  return fetchAllPages<GuruProduct>(PRODUCTS_URL, userToken, filters);
}

/**
 * Uma página de contatos (a lista completa é grande demais — 7000+ contatos
 * numa conta ativa — pra buscar tudo numa chamada só; o chamador guarda o
 * cursor entre execuções, ver contactsSyncChunk em .../guru/sync/route.ts).
 */
export async function fetchGuruContactsPage(
  userToken: string,
  cursor: string | null,
  filters: Filters = {}
): Promise<GuruPage<GuruContact>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  if (cursor) params.set("cursor", cursor);

  const json = await guruRequest(CONTACTS_URL, userToken, params);
  return {
    items: json.data ?? [],
    nextCursor: json.has_more_pages ? json.next_cursor ?? null : null,
    hasMorePages: !!json.has_more_pages,
    totalRows: typeof json.total_rows === "number" ? json.total_rows : null,
  };
}

/** YYYY-MM-DD no fuso de referência da API (os exemplos da doc usam UTC). */
export function toGuruDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
