import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGuruSubscriptions, fetchGuruTransactions, toGuruDate } from "@/lib/integrations/guru";
import { mapGuruSubscription, mapGuruTransaction } from "@/lib/integrations/guru-map";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A API da Guru não deixa filtrar por data com janela maior que 180 dias. */
const MAX_BACKFILL_DAYS = 175;
/** Margem de segurança pra não perder atualizações entre um tick e outro. */
const OVERLAP_MS = 60 * 60 * 1000;
const UPSERT_CHUNK = 200;

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
    .select("location_id, api_key, last_synced_at, sync_started_at")
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
  cred: { location_id: string; api_key: string; last_synced_at: string | null }
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
  const byId = new Map<string, any>();
  let txnsTruncated = false;
  for (const { items, truncated } of txnResults) {
    if (truncated) txnsTruncated = true;
    for (const t of items) byId.set(t.id, t);
  }

  await Promise.all([
    upsertMany(
      db,
      "payment_subscriptions",
      subs.map((s) => ({
        location_id: cred.location_id,
        provider: "guru",
        ...mapGuruSubscription(s),
      }))
    ),
    upsertMany(
      db,
      "payment_events",
      Array.from(byId.values()).map((t) => ({
        location_id: cred.location_id,
        provider: "guru",
        ...mapGuruTransaction(t),
      }))
    ),
  ]);

  await db
    .from("payment_credentials")
    .update({ last_synced_at: now.toISOString() })
    .eq("location_id", cred.location_id)
    .eq("provider", "guru");

  return {
    locationId: cred.location_id,
    subscriptions: subs.length,
    transactions: byId.size,
    truncated: subsTruncated || txnsTruncated,
  };
}
