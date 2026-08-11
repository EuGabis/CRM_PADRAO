import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Nunca cachear: cada chamada é um evento novo. */
export const dynamic = "force-dynamic";

/**
 * Webhook do WhatsApp (Meta Cloud API). Fora do matcher do proxy — chamada
 * máquina-a-máquina, sem sessão. GET faz o handshake da Meta; POST valida a
 * assinatura (HMAC do corpo cru com WHATSAPP_APP_SECRET) e grava nas Conversas
 * com a service role (aparece no inbox pelo Realtime já publicado).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verify = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && verify && verify === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("payload inválido", { status: 400 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "webhook sem credenciais no servidor" }, { status: 503 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: channel } = await db
        .from("whatsapp_channels")
        .select("id, location_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!channel) continue; // número não cadastrado aqui — ignora

      for (const m of value.messages ?? []) {
        await handleIncoming(db, channel, value, m);
      }
      for (const st of value.statuses ?? []) {
        if (st?.id && st?.status) {
          await db.from("messages").update({ status: st.status }).eq("wa_message_id", st.id);
        }
      }
    }
  }

  return Response.json({ ok: true });
}

async function handleIncoming(db: any, channel: any, value: any, m: any) {
  const waId = m.id;
  if (!waId) return;

  // idempotência: mesma mensagem chega mais de uma vez
  const { data: dup } = await db
    .from("messages")
    .select("id")
    .eq("wa_message_id", waId)
    .maybeSingle();
  if (dup) return;

  const phone: string = m.from ?? "";
  if (!phone) return;
  const profileName: string = value?.contacts?.[0]?.profile?.name || phone;
  const nowIso = new Date().toISOString();

  // contato por telefone dentro da empresa
  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("location_id", channel.location_id)
    .eq("phone", phone)
    .maybeSingle();
  if (!contact) {
    const parts = profileName.trim().split(/\s+/);
    const first = parts.shift() || phone;
    const { data: created } = await db
      .from("contacts")
      .insert({
        location_id: channel.location_id,
        first_name: first,
        last_name: parts.join(" "),
        phone,
        last_activity_channel: "whatsapp",
        last_activity_at: nowIso,
      })
      .select("id")
      .single();
    contact = created;
  }
  if (!contact) return;

  const text: string = m.text?.body ?? `[${m.type ?? "mídia"}]`;

  // conversa de whatsapp desse contato
  let { data: conv } = await db
    .from("conversations")
    .select("id, unread_count")
    .eq("location_id", channel.location_id)
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!conv) {
    const { data: created } = await db
      .from("conversations")
      .insert({
        location_id: channel.location_id,
        contact_id: contact.id,
        channel: "whatsapp",
        channel_id: channel.id,
        unread_count: 1,
        last_message_at: nowIso,
        last_message_preview: text,
      })
      .select("id")
      .single();
    conv = created;
  } else {
    await db
      .from("conversations")
      .update({
        channel_id: channel.id,
        unread_count: (conv.unread_count ?? 0) + 1,
        last_message_at: nowIso,
        last_message_preview: text,
      })
      .eq("id", conv.id);
  }
  if (!conv) return;

  const { error: insErr } = await db.from("messages").insert({
    location_id: channel.location_id,
    conversation_id: conv.id,
    direction: "in",
    type: "text",
    channel: "whatsapp",
    body: text,
    channel_id: channel.id,
    wa_message_id: waId,
    status: "delivered",
  });
  // corrida: entrega duplicada da Meta — o índice único barra o 2º insert; ignore
  if (insErr && (insErr as any).code !== "23505") throw insErr;
}
