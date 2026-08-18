import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { uploadMedia, sendMediaMessage } from "@/lib/whatsapp/client";
import { sendMedia as sendEvolutionMedia, sendWhatsAppAudio } from "@/lib/evolution/client";
import { tipoPorMime, limiteExcedido, rotuloLimite, type TipoMidia } from "@/lib/whatsapp/media-limits";

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
  const kind = body?.kind as "image" | "audio" | "video" | "file";
  if (
    !conversationId ||
    !messageId ||
    !mediaPath ||
    typeof mediaPath !== "string" ||
    !["image", "audio", "video", "file"].includes(kind)
  ) {
    return Response.json({ error: "parâmetros ausentes" }, { status: 400 });
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id, location_id, channel_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });

  // FURO DE SEGURANÇA (pré-existente, herdado do caminho Meta): `mediaPath`
  // vem do corpo do request e mais abaixo é usado com o cliente service
  // role, que passa por cima das policies do Storage. Sem esta checagem, um
  // usuário autenticado da empresa A poderia mandar o caminho de um objeto
  // da empresa B no bucket `conversation-media` e fazer o CRM entregá-lo a
  // um contato seu — vazamento entre inquilinos.
  //
  // A defesa: carregar a MENSAGEM `messageId` com o cliente da SESSÃO (não
  // o admin) — a RLS já garante que ela pertence à empresa do usuário — e
  // confirmar que o `media_path` gravado nela é exatamente igual ao
  // `mediaPath` recebido. Só depois disso o `mediaPath` pode ser usado com
  // o cliente admin. Isso vale para os dois ramos (`evolution` e `meta`).
  const { data: msgOwner } = await supabase
    .from("messages")
    .select("media_path, media_name")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!msgOwner || msgOwner.media_path !== mediaPath) {
    // Nunca logar os caminhos aqui — o log serve pra detectar tentativa de
    // acesso indevido, não pra virar ele mesmo um vazamento entre empresas.
    console.error(
      "[whatsapp/send-media] mediaPath não confere com a mensagem — messageId:",
      messageId,
    );
    return Response.json({ error: "Mídia não encontrada." }, { status: 403 });
  }

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

    // O tier do limite vem do `kind` (já validado contra image/audio/video no
    // início da rota), não do mime que o cliente declara no corpo — declarar
    // "application/pdf" num vídeo não pode cair no teto de documento (100 MB)
    // em vez do de vídeo (16 MB). O mime só serve de fallback se o `kind` por
    // algum motivo não resolver.
    const tipoPorKind: Partial<Record<string, TipoMidia>> = {
      image: "image",
      audio: "audio",
      video: "video",
      file: "file",
    };
    const tipo = tipoPorKind[kind] ?? tipoPorMime(mime ?? "");
    if (!tipo) return Response.json({ error: "Tipo de arquivo não reconhecido" }, { status: 400 });
    if (limiteExcedido(tipo, tamanhoEmBytes)) {
      // O objeto já subiu pro Storage (gate client-side só barra 15 MB
      // uniforme, não o teto por tipo) — sem remover aqui, fica lixo pago
      // no Storage do dono da plataforma para sempre.
      const { error: rmErr } = await admin.storage.from("conversation-media").remove([mediaPath]);
      if (rmErr) {
        console.error(
          "[whatsapp/send-media] falha ao remover objeto órfão após limite excedido — tipo:",
          tipo,
        );
      }
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
        // Manda o nome ORIGINAL do arquivo, não o nome do objeto no bucket
        // (um UUID) — senão o contato recebe "a1b2c3.pdf" em vez do nome que
        // ele reconhece.
        waResp = await sendEvolutionMedia(
          segredo.evolution_instance,
          segredo.evolution_token,
          to,
          tipo,
          assinada.signedUrl,
          msgOwner.media_name || nomeNoBucket,
          caption,
        );
      }
    } catch (e) {
      // Mensagem genérica de propósito: o erro cru do gateway ecoa o nome da
      // instância no path. Nunca logue a URL assinada, o token, o conteúdo ou
      // o nome do arquivo do cliente — só o status HTTP (extraído da
      // mensagem formatada por `evoError` em evolution/client.ts, que sempre
      // traz "HTTP <status>") e o nome da instância. Importa em especial
      // para `sendWhatsAppAudio`: é o caminho mais provável de quebrar no
      // primeiro envio real (webm/opus gravado pelo navegador — ver
      // sonda.md), e hoje falhava sem deixar rastro nenhum.
      const httpStatus = /HTTP (\d+)/.exec((e as Error)?.message ?? "")?.[1] ?? "desconhecido";
      console.error(
        "[whatsapp/send-media] falha no gateway Evolution — instância:",
        segredo.evolution_instance,
        "HTTP:",
        httpStatus,
      );
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
      // Nome exibido ao contato só existe para documento (`filename` do
      // media object da Cloud API) — para os demais tipos o parâmetro é
      // ignorado por `sendMediaMessage`, então nada muda para eles.
      waResp = await sendMediaMessage(
        channel.phone_number_id,
        to,
        kind,
        mediaId,
        caption,
        kind === "file" ? msgOwner.media_name ?? undefined : undefined,
      );
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
