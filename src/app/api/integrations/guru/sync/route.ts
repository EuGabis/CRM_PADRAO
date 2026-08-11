import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchGuruContactsPage,
  fetchGuruSubscriptions,
  fetchGuruTransactions,
  toGuruDate,
} from "@/lib/integrations/guru";
import { mapGuruContact, mapGuruSubscription, mapGuruTransaction } from "@/lib/integrations/guru-map";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Janela do PRIMEIRO backfill de vendas (last_synced_at nulo). A Guru permite
 * até 180 dias por filtro de data, mas essa conta vende muito (2500+ vendas
 * no total) — paginar 175 dias x 3 campos de data (ordered/confirmed/cancelled)
 * sempre passava dos 60s do Vercel e a sincronização nunca avançava (confirmado
 * nos logs: "Task timed out after 60 seconds" em toda chamada). 3 dias garante
 * que o primeiro tick termine e o cursor incremental assuma — vendas mais
 * antigas que isso não entram automaticamente por ora.
 */
const MAX_BACKFILL_DAYS = 3;
/** Margem de segurança pra não perder atualizações entre um tick e outro. */
const OVERLAP_MS = 60 * 60 * 1000;
const UPSERT_CHUNK = 200;

/**
 * Backfill histórico (retroativo, além do que o backfill inicial de 3 dias
 * cobre): a partir de onde a cobertura incremental já começa, anda pra trás
 * em pedaços de 7 dias por tick até chegar em HISTORY_START. 7 dias cabe
 * folgado nos 60s mesmo pra essa conta com muitas vendas — ver migração 0017.
 */
const HISTORY_START = new Date("2024-06-01T00:00:00Z");
const HISTORY_CHUNK_DAYS = 7;

/**
 * Contatos (GET /api/v2/contacts) — lista própria da Guru, com telefone/doc
 * e uma contagem (total_rows) que é o número mostrado no painel dela. Cada
 * página é uma chamada rápida; 10 por tick sincroniza uma conta com 7000+
 * contatos em menos de 15 ticks, bem dentro dos 60s mesmo somado ao resto.
 */
const CONTACTS_PAGES_PER_TICK = 10;

/**
 * Puxa vendas e assinaturas da API da Guru (REST, não webhook) pra cada
 * empresa conectada e grava/atualiza em payment_events/payment_subscriptions.
 * Chamada todo minuto pelo pg_cron (via pg_net, ver migração 0010),
 * protegida por x-guru-sync-secret — sem sessão de usuário, mesmo padrão
 * do motor de automações.
 *
 * Backfill (primeira vez, last_synced_at nulo): assinaturas sem filtro de
 * data (a API devolve tudo); vendas limitadas aos últimos 175 dias (o
 * máximo que a API permite por ordered_at/confirmed_at/cancelled_at).
 * Depois disso, cada tick busca só o que mudou desde o último sync (com 1h
 * de sobreposição). Se uma conta tiver histórico grande, o primeiro
 * backfill pode levar alguns ticks pra terminar — cada página já vai sendo
 * gravada, então nada se perde, só demora a ficar 100% em dia.
 */
export async function POST(request: Request) {
  const expected = process.env.GURU_SYNC_SECRET;
  if (!expected) {
    return Response.json({ error: "sincronização sem GURU_SYNC_SECRET configurado" }, { status: 503 });
  }
  const secret = request.headers.get("x-guru-sync-secret");
  if (!secret || secret !== expected) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "sem credenciais de banco no servidor" }, { status: 503 });
  }

  const { data: credentials, error } = await db
    .from("payment_credentials")
    .select(
      "location_id, api_key, last_synced_at, sync_started_at, history_backfill_cursor, history_backfill_done, contacts_sync_cursor, contacts_sync_done"
    )
    .eq("provider", "guru")
    .not("api_key", "is", null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const cred of credentials ?? []) {
    const claimed = await claim(db, cred.location_id);
    if (!claimed) {
      results.push({ locationId: cred.location_id, skipped: "já sincronizando em outro tick" });
      continue;
    }
    try {
      results.push(await syncAccount(db, cred));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[guru-sync] falha na empresa ${cred.location_id}:`, message);
      results.push({ locationId: cred.location_id, error: message });
    }
  }

  return Response.json({ synced: results });
}

async function claim(db: any, locationId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 55_000).toISOString();
  const { data } = await db
    .from("payment_credentials")
    .update({ sync_started_at: new Date().toISOString() })
    .eq("location_id", locationId)
    .eq("provider", "guru")
    .or(`sync_started_at.is.null,sync_started_at.lt.${staleBefore}`)
    .select("location_id")
    .maybeSingle();
  return !!data;
}

async function upsertMany(db: any, table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db
      .from(table)
      .upsert(chunk, { onConflict: "location_id,provider,external_id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function syncAccount(
  db: any,
  cred: {
    location_id: string;
    api_key: string;
    last_synced_at: string | null;
    history_backfill_cursor: string | null;
    history_backfill_done: boolean;
    contacts_sync_cursor: string | null;
    contacts_sync_done: boolean;
  }
) {
  const userToken = cred.api_key;
  const now = new Date();
  const since = cred.last_synced_at ? new Date(cred.last_synced_at) : null;

  // Assinaturas e as 3 janelas de vendas (ordered_at/confirmed_at/cancelled_at) são
  // consultas independentes na API da Guru — buscar tudo em paralelo em vez de
  // sequencial. Uma conta com histórico grande passa fácil de 60s se isso rodar
  // um pedido depois do outro.
  const subFilters: Record<string, string> = since
    ? {
        last_status_at_ini: toGuruDate(new Date(since.getTime() - OVERLAP_MS)),
        last_status_at_end: toGuruDate(now),
      }
    : {};
  const windowStart = since
    ? new Date(since.getTime() - OVERLAP_MS)
    : new Date(now.getTime() - MAX_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  const windowStartStr = toGuruDate(windowStart);
  const windowEndStr = toGuruDate(now);

  const [subsResult, ...txnResults] = await Promise.all([
    fetchGuruSubscriptions(userToken, subFilters),
    ...["ordered_at", "confirmed_at", "cancelled_at"].map((field) =>
      fetchGuruTransactions(userToken, {
        [`${field}_ini`]: windowStartStr,
        [`${field}_end`]: windowEndStr,
      })
    ),
  ]);

  const { items: subs, truncated: subsTruncated } = subsResult;

  // Assinaturas são o caminho crítico: grava PRIMEIRO e sozinho, pra que uma
  // falha nas vendas (ex.: erro na API/upsert) não trave a atualização das
  // assinaturas — antes as duas iam juntas num Promise.all e um erro nas vendas
  // deixava o last_synced_at nulo pra sempre (re-backfill infinito, estourando
  // o teto de 60s da função).
  await upsertMany(
    db,
    "payment_subscriptions",
    subs.map((s) => ({
      location_id: cred.location_id,
      provider: "guru",
      ...mapGuruSubscription(s),
    }))
  );

  // Vendas: melhor-esforço e isolado. Se falhar, registramos o erro na resposta
  // (visível em net._http_response no Supabase) e seguimos — sem bloquear o
  // avanço do last_synced_at nem a atualização das assinaturas.
  const byId = new Map<string, any>();
  let txnsTruncated = false;
  let transactionsError: string | null = null;
  for (const { items, truncated } of txnResults) {
    if (truncated) txnsTruncated = true;
    for (const t of items) byId.set(t.id, t);
  }
  try {
    await upsertMany(
      db,
      "payment_events",
      Array.from(byId.values()).map((t) => ({
        location_id: cred.location_id,
        provider: "guru",
        ...mapGuruTransaction(t),
      }))
    );
  } catch (e) {
    transactionsError = e instanceof Error ? e.message : String(e);
    console.error(`[guru-sync] upsert de vendas falhou p/ ${cred.location_id}:`, transactionsError);
  }

  // Avança a marca d'água sempre que as assinaturas gravaram — isso tira a conta
  // do modo backfill (janela de 175 dias) e a coloca no incremental (janela
  // curta), que cabe folgado nos 60s. Uma falha só nas vendas não impede isso.
  await db
    .from("payment_credentials")
    .update({ last_synced_at: now.toISOString() })
    .eq("location_id", cred.location_id)
    .eq("provider", "guru");

  // Backfill retroativo: melhor-esforço, roda depois do incremental e nunca
  // impede o resto — se falhar, o próximo tick tenta o mesmo pedaço de novo.
  let history: { historyRangeStart: string; historyRangeEnd: string; count: number } | null = null;
  if (!cred.history_backfill_done) {
    try {
      history = await historyBackfillChunk(db, cred, userToken, windowStart);
    } catch (e) {
      console.error(
        `[guru-sync] backfill histórico falhou p/ ${cred.location_id}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  // Contatos: melhor-esforço, mesma lógica de isolamento do backfill histórico.
  let contacts: { count: number; totalRows: number | null; done: boolean } | null = null;
  if (!cred.contacts_sync_done) {
    try {
      contacts = await contactsSyncChunk(db, cred, userToken);
    } catch (e) {
      console.error(
        `[guru-sync] sync de contatos falhou p/ ${cred.location_id}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    locationId: cred.location_id,
    subscriptions: subs.length,
    transactions: byId.size,
    transactionsError,
    truncated: subsTruncated || txnsTruncated,
    history,
    contacts,
  };
}

/**
 * Até CONTACTS_PAGES_PER_TICK páginas de /api/v2/contacts por tick, retomando
 * do cursor salvo. Guarda cursor/done/total_rows numa atualização só ao final
 * — se cair no meio, o próximo tick refaz as últimas páginas (upsert é
 * idempotente) em vez de perder o progresso todo.
 */
async function contactsSyncChunk(
  db: any,
  cred: { location_id: string; contacts_sync_cursor: string | null },
  userToken: string
) {
  let cursor = cred.contacts_sync_cursor;
  let totalRows: number | null = null;
  let done = false;
  let count = 0;

  for (let page = 0; page < CONTACTS_PAGES_PER_TICK; page++) {
    const result = await fetchGuruContactsPage(userToken, cursor);
    if (result.totalRows !== null) totalRows = result.totalRows;
    count += result.items.length;

    await upsertMany(
      db,
      "payment_guru_contacts",
      result.items.map((c: any) => ({
        location_id: cred.location_id,
        provider: "guru",
        ...mapGuruContact(c),
      }))
    );

    cursor = result.nextCursor;
    if (!result.hasMorePages) {
      done = true;
      break;
    }
  }

  await db
    .from("payment_credentials")
    .update({
      contacts_sync_cursor: cursor,
      contacts_sync_done: done,
      ...(totalRows !== null ? { contacts_total_rows: totalRows } : {}),
    })
    .eq("location_id", cred.location_id)
    .eq("provider", "guru");

  return { count, totalRows, done };
}

/**
 * Um pedaço do backfill retroativo (7 dias). `incrementalCoverageStart` é o
 * início da janela que o sync incremental já cobriu nesta mesma chamada —
 * usado só na primeira vez (cursor nulo) pra começar exatamente daí pra
 * trás, sem sobrepor nem deixar buraco entre o incremental e o histórico.
 */
async function historyBackfillChunk(
  db: any,
  cred: { location_id: string; history_backfill_cursor: string | null },
  userToken: string,
  incrementalCoverageStart: Date
) {
  const chunkEnd = cred.history_backfill_cursor
    ? new Date(cred.history_backfill_cursor)
    : incrementalCoverageStart;
  const chunkStartMs = chunkEnd.getTime() - HISTORY_CHUNK_DAYS * 24 * 60 * 60 * 1000;
  const chunkStart = new Date(Math.max(HISTORY_START.getTime(), chunkStartMs));

  const { items } = await fetchGuruTransactions(userToken, {
    ordered_at_ini: toGuruDate(chunkStart),
    ordered_at_end: toGuruDate(chunkEnd),
  });

  await upsertMany(
    db,
    "payment_events",
    items.map((t: any) => ({
      location_id: cred.location_id,
      provider: "guru",
      ...mapGuruTransaction(t),
    }))
  );

  const done = chunkStart.getTime() <= HISTORY_START.getTime();
  await db
    .from("payment_credentials")
    .update({
      history_backfill_cursor: chunkStart.toISOString(),
      history_backfill_done: done,
    })
    .eq("location_id", cred.location_id)
    .eq("provider", "guru");

  return {
    historyRangeStart: toGuruDate(chunkStart),
    historyRangeEnd: toGuruDate(chunkEnd),
    count: items.length,
  };
}
