import { createAdminClient } from "@/lib/supabase/admin";
import { extractNestedSubscription, mapGuruSubscription, mapGuruTransaction } from "@/lib/integrations/guru-map";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Nunca cachear: cada chamada é um evento novo. */
export const dynamic = "force-dynamic";

/**
 * Recebe os webhooks de venda/assinatura da Digital Manager Guru.
 *
 * A Guru autentica cada chamada enviando o campo `api_token` no corpo (é o
 * Account Token da conta) — comparamos com o token salvo por empresa em
 * `payment_credentials` (colado pelo admin a partir do painel da Guru, em
 * Configurar provedores > Guru). Sem correspondência, 401 — a rota roda com
 * a service role e não tem sessão de usuário (chamada máquina-a-máquina).
 *
 * `webhook_type` diz o formato do corpo: "transaction" (venda, ver
 * openapi/webhooks/vendas.yaml) ou "subscription" (assinatura, ver
 * openapi/webhooks/assinaturas.yaml) — os nomes de campo usados em
 * guru-map.ts vêm direto dessas specs. Cada um também pode trazer o outro
 * aninhado (transaction.subscription / subscription.last_transaction), e
 * aproveitamos os dois. Faz upsert (não insert) porque a mesma
 * venda/assinatura chega de novo a cada mudança de status.
 */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "payload inválido" }, { status: 400 });
  }

  const token =
    (typeof body?.api_token === "string" && body.api_token) ||
    request.headers.get("x-guru-token");
  if (!token) {
    return Response.json({ error: "token ausente" }, { status: 401 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "integração sem credenciais no servidor" }, { status: 503 });
  }

  const { data: credential } = await db
    .from("payment_credentials")
    .select("location_id")
    .eq("provider", "guru")
    .eq("webhook_token", token)
    .maybeSingle();

  if (!credential) {
    return Response.json({ error: "token não reconhecido" }, { status: 401 });
  }

  const locationId = credential.location_id;
  const isSubscription = body?.webhook_type === "subscription";
  const errors: string[] = [];

  if (isSubscription) {
    await upsertSubscription(db, locationId, body, errors);
    if (body?.last_transaction) {
      await upsertTransaction(db, locationId, body.last_transaction, errors);
    }
  } else {
    await upsertTransaction(db, locationId, body, errors);
    const nestedSub = extractNestedSubscription(body);
    if (nestedSub) {
      await upsertSubscription(db, locationId, nestedSub, errors);
    }
  }

  if (errors.length > 0) {
    console.error("[pagamentos] falha ao gravar webhook da Guru:", errors);
    return Response.json({ error: "falha ao gravar", details: errors }, { status: 500 });
  }
  return Response.json({ ok: true });
}

async function upsertTransaction(db: any, locationId: string, txn: any, errors: string[]) {
  const row = mapGuruTransaction(txn);
  const { error } = await db
    .from("payment_events")
    .upsert(
      { location_id: locationId, provider: "guru", ...row },
      { onConflict: "location_id,provider,external_id" }
    );
  if (error) errors.push(`payment_events: ${error.message}`);
}

async function upsertSubscription(db: any, locationId: string, sub: any, errors: string[]) {
  const row = mapGuruSubscription(sub);
  const { error } = await db
    .from("payment_subscriptions")
    .upsert(
      { location_id: locationId, provider: "guru", ...row },
      { onConflict: "location_id,provider,external_id" }
    );
  if (error) errors.push(`payment_subscriptions: ${error.message}`);
}
