import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Nunca cachear: cada chamada é um evento novo. */
export const dynamic = "force-dynamic";

/**
 * Webhook da Evolution (gateway próprio de WhatsApp não oficial, Baileys).
 * Fora do matcher do proxy — chamada máquina-a-máquina, sem sessão.
 *
 * A URL é ÚNICA e compartilhada por todos os canais Evolution do CRM (ver
 * WEBHOOK_URL em `evolution/conectar/route.ts`); quem distingue de qual canal
 * é o evento é o header `apikey`, que o gateway ecoa com o `webhook_secret`
 * configurado para aquela instância em `createInstance` (client.ts). O
 * gateway também hospeda instâncias de OUTROS projetos do dono — nenhuma
 * delas aponta pra cá de propósito, mas uma reconfiguração errada pode
 * mandar o evento aqui por engano; esse caso não é erro nosso, só ignora.
 *
 * Ordem de validação:
 *   1. Sem o header `apikey` -> 401 imediato, nem olha o corpo.
 *   2. Canal pela `evolution_instance` do payload. Não existe aqui -> 200 e
 *      ignora (pode ser instância de outro projeto/erro de config alheio).
 *   3. Canal existe -> compara (timing-safe) o header com o `webhook_secret`
 *      dele. Não bate -> 401 genérico, sem dizer o motivo.
 *   4. Só depois disso processa o evento.
 *
 * Formato do corpo: a sonda da Task 2 confirmou as rotas do gateway mas não
 * chegou a capturar um payload real de mensagem recebida (sem número
 * conectado no momento). Os campos abaixo (`event`, `instance`, `data.key`,
 * `data.message`, `data.pushName`) seguem o formato documentado da Evolution
 * API v2 (Baileys) — mas cada leitura é defensiva: campo ausente vira log
 * (só as CHAVES do payload, nunca o conteúdo da mensagem) e resposta 200,
 * nunca uma exceção que derruba o webhook.
 */
export async function POST(request: Request) {
  const secretHeader = request.headers.get("apikey");
  if (!secretHeader) {
    return new Response("não autorizado", { status: 401 });
  }

  let raw: string;
  let body: any;
  try {
    raw = await request.text();
    body = JSON.parse(raw);
  } catch {
    // Corpo ilegível: não é uma reentrega válida do gateway pra reprocessar.
    // Responde 200 pra não entrar em laço de retry por um payload que nunca
    // vai virar JSON válido.
    return Response.json({ ok: true });
  }

  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    console.error("[whatsapp/evolution/webhook] sem credenciais de admin no servidor:", e);
    return Response.json({ ok: true });
  }

  try {
    const instancia: string | undefined = body?.instance ?? body?.instanceName;
    if (!instancia) {
      console.error("[whatsapp/evolution/webhook] payload sem instância — chaves:", Object.keys(body ?? {}));
      return Response.json({ ok: true });
    }

    const { data: channel } = await db
      .from("whatsapp_channels")
      .select("id, location_id, daily_limit, webhook_secret, connection_state")
      .eq("provider", "evolution")
      .eq("evolution_instance", instancia)
      .maybeSingle();

    // Canal desconhecido: pode ser instância de outro projeto do dono
    // apontando pra cá por engano de configuração. Não é erro nosso — ignora
    // sem gravar nada e sem vazar se a instância existe ou não além disso.
    if (!channel) {
      return Response.json({ ok: true });
    }

    if (!validSecret(secretHeader, channel.webhook_secret)) {
      return new Response("não autorizado", { status: 401 });
    }

    const evento = String(body?.event ?? "")
      .toUpperCase()
      .replace(/[.\s]+/g, "_");

    if (evento === "MESSAGES_UPSERT") {
      const items = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
      for (const item of items) {
        try {
          await handleMessage(db, channel, item);
        } catch (e) {
          // Best-effort: uma mensagem malformada/sem suporte nunca derruba o webhook.
          console.error("[whatsapp/evolution/webhook] falha ao processar mensagem:", e);
        }
      }
    } else if (evento === "CONNECTION_UPDATE") {
      try {
        await handleConnectionUpdate(db, channel, body);
      } catch (e) {
        console.error("[whatsapp/evolution/webhook] falha ao processar connection_update:", e);
      }
    }
    // Outros eventos: ignora silenciosamente (não assinados no webhook/set).

    return Response.json({ ok: true });
  } catch (e) {
    // Responde 200 mesmo em erro interno: webhook que responde erro faz o
    // gateway reentregar em laço.
    console.error("[whatsapp/evolution/webhook] erro inesperado:", e);
    return Response.json({ ok: true });
  }
}

function validSecret(header: string, expected: string | null): boolean {
  if (!expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleMessage(db: any, channel: any, item: any) {
  const key = item?.key ?? {};
  const waId: string | undefined = key.id;
  if (!waId) {
    console.error("[whatsapp/evolution/webhook] mensagem sem key.id — chaves:", Object.keys(item ?? {}));
    return;
  }

  // Mensagem enviada pelo próprio número (do celular, não pela API): o
  // Baileys ecoa no messages.upsert, mas não é uma mensagem de cliente pra
  // entrar no inbox como "in".
  if (key.fromMe) return;

  const remoteJid: string | undefined = key.remoteJid;
  if (!remoteJid) {
    console.error("[whatsapp/evolution/webhook] mensagem sem key.remoteJid — chaves:", Object.keys(key));
    return;
  }
  // Grupo: não tem um "contato" único por trás — fora do escopo desta tarefa.
  if (remoteJid.endsWith("@g.us")) return;

  const phone = remoteJid.split("@")[0];
  if (!phone) return;

  // idempotência: mesma mensagem chega mais de uma vez (reentrega do gateway)
  const { data: dup } = await db
    .from("messages")
    .select("id")
    .eq("wa_message_id", waId)
    .maybeSingle();
  if (dup) return;

  const pushName: string = item?.pushName || phone;
  const nowIso = new Date().toISOString();

  // contato por telefone dentro da empresa
  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("location_id", channel.location_id)
    .eq("phone", phone)
    .maybeSingle();
  if (!contact) {
    const parts = pushName.trim().split(/\s+/);
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

  // Conteúdo: só texto por enquanto — o formato de mídia não foi confirmado
  // por sonda real (não havia número conectado), então não inventa download.
  const msgType = "text";
  const msg = item?.message ?? {};
  let body =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    undefined;
  if (body === undefined) {
    const tipo = item?.messageType || Object.keys(msg)[0] || "mensagem";
    body = `[${tipo}]`;
  }

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
        last_message_preview: body,
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
        last_message_preview: body,
        // O cliente escreveu: a conversa volta pra caixa mesmo que alguém
        // tenha finalizado ou arquivado antes (0029). Perder mensagem de
        // cliente é pior do que desfazer um arquivamento.
        closed_at: null,
        closed_by: null,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", conv.id);
  }
  if (!conv) return;

  const { error: insErr } = await db.from("messages").insert({
    location_id: channel.location_id,
    conversation_id: conv.id,
    direction: "in",
    type: msgType,
    channel: "whatsapp",
    body,
    channel_id: channel.id,
    wa_message_id: waId,
    status: "delivered",
  });
  if (insErr) {
    // corrida: reentrega do gateway — o índice único parcial (0022) barra o
    // 2º insert. Nesse caso NÃO reprocessa.
    if ((insErr as any).code !== "23505") throw insErr;
  }
}

async function handleConnectionUpdate(db: any, channel: any, body: any) {
  const newState: string | undefined = body?.data?.state ?? body?.data?.instance?.state;
  if (!newState) {
    console.error(
      "[whatsapp/evolution/webhook] connection_update sem state — chaves:",
      Object.keys(body?.data ?? {}),
    );
    return;
  }

  const patch: Record<string, unknown> = { connection_state: newState };
  if (newState === "open") {
    patch.disconnected_at = null;
  } else if (channel.connection_state === "open") {
    // só carimba no momento em que sai de "open" — reentregas do mesmo
    // estado "close"/"connecting" não empurram o carimbo pra frente.
    patch.disconnected_at = new Date().toISOString();
  }

  await db.from("whatsapp_channels").update(patch).eq("id", channel.id);
}
