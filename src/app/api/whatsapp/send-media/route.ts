import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { uploadMedia, sendMediaMessage } from "@/lib/whatsapp/client";
import { sendMedia as sendEvolutionMedia, sendWhatsAppAudio } from "@/lib/evolution/client";
import { tipoPorMime, limiteExcedido, rotuloLimite } from "@/lib/whatsapp/media-limits";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "payload inválido" }, { status: 400 });
  }
  const { conversationId, channelId, messageId, mediaPath, mime, caption } = body ?? {};
  const kind = body?.kind as "image" | "audio" | "video";
  if (!conversationId || !messageId || !mediaPath || !["image", "audio", "video"].includes(kind)) {
    return Response.json({ error: "parâmetros ausentes" }, { status: 400 });
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id, location_id, channel_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });

  // Módulo bloqueado no plano não gasta o WHATSAPP_TOKEN global. A location vem
  // da conversa (validada pela RLS), nunca do corpo do request.
  const bloqueio = await assertModuleEnabled(conv.location_id, "whatsapp");
  if (bloqueio) return Response.json({ error: bloqueio }, { status: 403 });

  // `evolution_token` é segredo (só a service role lê desde a 0058); as demais
  // colunas aqui são públicas. Mesma lista de `send/route.ts`.
  const { data: channel } = await supabase
    .from("whatsapp_channels")
    .select("id, provider, phone_number_id, connection_state, active, daily_limit")
    .eq("id", channelId ?? conv.channel_id)
    .maybeSingle();
  if (!channel || !channel.active) {
    return Response.json({ error: "Canal inválido ou inativo" }, { status: 400 });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", conv.contact_id)
    .maybeSingle();
  const to = (contact?.phone ?? "").replace(/\D/g, "");
  if (!to) return Response.json({ error: "Contato sem telefone" }, { status: 400 });

  // limite diário
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channel.id)
    .eq("direction", "out")
    .gte("created_at", startOfDay.toISOString());
  if ((count ?? 0) >= channel.daily_limit) {
    return Response.json({ error: "Limite diário do canal atingido" }, { status: 429 });
  }

  if (channel.provider === "evolution") {
    // Sem janela de 24h nesse provedor — checagem exclusiva do caminho `meta`,
    // não se aplica aqui.
    if (channel.connection_state !== "open") {
      return Response.json(
        { error: "WhatsApp desconectado — reconecte o canal antes de enviar." },
        { status: 409 },
      );
    }

    // Tamanho vem do objeto no Storage, ANTES de gerar URL ou chamar o
    // gateway — o cliente não é fonte de verdade sobre o tamanho do próprio
    // arquivo (o `download()` inteiro do caminho Meta não serve aqui: só
    // precisamos do metadado, não do conteúdo).
    const admin = createAdminClient();
    const barra = mediaPath.lastIndexOf("/");
    const dir = barra >= 0 ? mediaPath.slice(0, barra) : "";
    const nomeNoBucket = barra >= 0 ? mediaPath.slice(barra + 1) : mediaPath;
    const { data: listagem, error: listErr } = await admin.storage
      .from("conversation-media")
      .list(dir, { search: nomeNoBucket });
    const objeto = listagem?.find((o) => o.name === nomeNoBucket);
    const tamanhoEmBytes = objeto?.metadata?.size;
    if (listErr || typeof tamanhoEmBytes !== "number") {
      return Response.json({ error: "Mídia não encontrada." }, { status: 400 });
    }

    const tipo = tipoPorMime(mime ?? "");
    if (!tipo) return Response.json({ error: "Tipo de arquivo não reconhecido" }, { status: 400 });
    if (limiteExcedido(tipo, tamanhoEmBytes)) {
      return Response.json(
        { error: `Arquivo maior que o limite de ${rotuloLimite(tipo)} para ${tipo}.` },
        { status: 400 },
      );
    }

    // Segredo do canal: só a service role lê (0058). O `eq("id", channel.id)`
    // usa o id que a RLS já validou acima — a service role não amplia o
    // alcance, só devolve as colunas que a sessão do usuário não enxerga.
    const { data: segredo } = await admin
      .from("whatsapp_channels")
      .select("evolution_instance, evolution_token")
      .eq("id", channel.id)
      .maybeSingle();
    if (!segredo?.evolution_instance || !segredo?.evolution_token) {
      return Response.json(
        { error: "Canal sem instância provisionada — reconecte o canal." },
        { status: 409 },
      );
    }

    // URL assinada de curta duração; o gateway baixa sozinho.
    const { data: assinada, error: erroUrl } = await admin.storage
      .from("conversation-media")
      .createSignedUrl(mediaPath, 300);
    if (erroUrl || !assinada?.signedUrl) {
      return Response.json({ error: "Não foi possível preparar o arquivo para envio." }, { status: 500 });
    }

    let waResp: { id: string };
    try {
      if (kind === "audio") {
        waResp = await sendWhatsAppAudio(
          segredo.evolution_instance,
          segredo.evolution_token,
          to,
          assinada.signedUrl,
        );
      } else {
        waResp = await sendEvolutionMedia(
          segredo.evolution_instance,
          segredo.evolution_token,
          to,
          tipo,
          assinada.signedUrl,
          nomeNoBucket,
          caption,
        );
      }
    } catch {
      // Mensagem genérica de propósito: o erro cru do gateway ecoa o nome da
      // instância no path. Nunca logue a URL assinada, o token, o conteúdo ou
      // o nome do arquivo do cliente.
      await supabase.from("messages").update({ status: "failed" }).eq("id", messageId);
      return Response.json({ error: "Falha no gateway do WhatsApp" }, { status: 502 });
    }

    const waMessageId = waResp.id || null;
    await supabase
      .from("messages")
      .update({ wa_message_id: waMessageId, status: "sent" })
      .eq("id", messageId);

    return Response.json({ ok: true, waMessageId });
  } else {
    // caminho `meta` (Cloud API oficial) — comportamento original, intocado.

    // janela de 24h (mídia é texto livre — precisa da janela aberta)
    const { data: lastIn } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const within24h = !!lastIn && Date.now() - new Date(lastIn.created_at).getTime() < DAY_MS;
    if (!within24h) {
      return Response.json(
        { error: "Janela de 24h fechada — só dá para enviar template", needsTemplate: true },
        { status: 409 },
      );
    }

    // lê o arquivo do nosso Storage com a chave de serviço: já autorizamos o usuário
    // e a conversa acima, então não faz sentido a leitura depender do token da sessão
    // (era o suspeito nº 1 do "Authentication Error" na hora de baixar a mídia).
    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage
      .from("conversation-media")
      .download(mediaPath);
    if (dlErr || !blob) {
      return Response.json(
        { error: "Mídia não encontrada: " + (dlErr?.message ?? "arquivo ausente") },
        { status: 400 },
      );
    }
    const bytes = await blob.arrayBuffer();
    const sendBytes = bytes;
    const sendMime = mime || blob.type || "application/octet-stream";

    let waResp: any;
    try {
      const ext = (String(sendMime || "application/octet-stream").split("/")[1] || "bin").split(";")[0];
      const mediaId = await uploadMedia(channel.phone_number_id, sendBytes, sendMime, `media.${ext}`);
      waResp = await sendMediaMessage(channel.phone_number_id, to, kind, mediaId, caption);
    } catch (e) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", messageId);
      return Response.json(
        { error: e instanceof Error ? e.message : "Falha na Cloud API" },
        { status: 502 },
      );
    }

    const waMessageId = waResp?.messages?.[0]?.id ?? null;
    await supabase
      .from("messages")
      .update({ wa_message_id: waMessageId, status: "sent" })
      .eq("id", messageId);

    return Response.json({ ok: true, waMessageId });
  }
}
