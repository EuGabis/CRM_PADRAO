import { chat } from "@/lib/ai/openai";
import { transcreverAudio } from "@/lib/ai/transcrever";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { isLocationSuspended } from "@/lib/plan/suspensao";
import { enviarTexto } from "@/lib/whatsapp/enviar";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Teto de áudio recebido: acima disso não transcreve, trata como mídia não
 * interpretada. Sem teto, um áudio longo de um cliente final vira custo
 * aberto (Whisper) na conta do dono da plataforma. Checa duração quando o
 * payload trouxer `seconds`; na ausência dele, só o tamanho em bytes.
 */
const TETO_AUDIO_SEGUNDOS = 5 * 60;
const TETO_AUDIO_BYTES = 20 * 1024 * 1024;
const AUDIO_NAO_INTERPRETADO = "[áudio recebido, não foi possível transcrever]";

/** Duração da URL assinada da imagem enviada à OpenAI: só o tempo de uma
 * chamada de chat, para reduzir a janela de exposição do bucket privado. */
const URL_IMAGEM_TTL_SEGUNDOS = 120;
const IMAGEM_NAO_INTERPRETADA = "[imagem recebida, não foi possível processar]";
const VIDEO_RECEBIDO = "[vídeo recebido]";
const DOCUMENTO_RECEBIDO = "[documento recebido]";

/**
 * Trava de imagem: acrescentada ao FIM do `system` (depois da personalidade,
 * objetivo e informações que o cliente configura), nunca antes — uma
 * personalidade mais assertiva escrita pelo cliente poderia atropelar uma
 * instrução que viesse primeiro. Sem isso, o caso clássico e caro: cliente
 * manda comprovante de PIX, a IA "lê" a imagem e responde "pagamento
 * confirmado" sem ter consultado nada — o erro cai no cliente do dono da
 * plataforma. Texto verbatim do brief da Task 6, não alterar.
 */
const TRAVA_IMAGEM =
  "Você NUNCA confirma pagamento, valor, comprovante, documento ou identidade " +
  "a partir de uma imagem. Se a imagem parecer comprovante, boleto, nota, " +
  "documento ou algo que peça confirmação de valor, responda que um atendente " +
  "humano vai conferir e não afirme nada sobre o conteúdo.";

/**
 * Registra o motivo de cada saída da auto-resposta. Este é o caminho mais
 * caro do produto (gasta OPENAI_API_KEY e a credencial global do provedor a
 * cada mensagem recebida); sem este log não sobra nenhum rastro de que a IA
 * parou de responder. NUNCA logar conteúdo da conversa, transcrição ou
 * credencial — só o motivo e a location.
 */
function sair(locationId: string, motivo: string): void {
  console.info(`[auto-reply] saída: ${motivo} · location ${locationId}`);
}

/**
 * Auto-responder do WhatsApp. Chamado pelo webhook (service role) depois de
 * gravar uma mensagem de ENTRADA de texto. Best-effort: qualquer falha é
 * engolida — nunca pode quebrar o 200 do webhook.
 *
 * Regras (spec 2026-08-13):
 * - só responde o agente principal (is_primary) com status 'ativo';
 * - não responde se a conversa está com bot_paused=true (humano assumiu);
 * - respeita o daily_limit do canal;
 * - usa as últimas ~10 mensagens da conversa como contexto.
 */
export async function maybeAutoReply(
  db: any,
  p: {
    locationId: string;
    conversationId: string;
    channelId: string;
    toPhone: string;
    dailyLimit: number;
    // Duração do áudio em segundos, quando o payload do gateway trouxer
    // (ex.: `audioMessage.seconds`) — propagado pelo webhook da Evolution.
    // Quando ausente, o teto usa só `media_size`.
    audioSeconds?: number;
  },
): Promise<void> {
  try {
    if (!process.env.OPENAI_API_KEY) return sair(p.locationId, "sem-openai-key");

    // Plano da empresa ANTES de qualquer coisa: este caminho é o mais caro do
    // produto — roda pelo webhook, com service role, e gasta OPENAI_API_KEY e
    // a credencial global do provedor de WhatsApp (ambas na conta do dono da
    // plataforma) a cada mensagem recebida. A location vem do próprio
    // webhook, resolvida pelo canal/conversa. Saída silenciosa como as
    // demais: a função é best-effort e não pode quebrar o 200 do webhook.
    if (await assertModuleEnabled(p.locationId, "whatsapp")) return sair(p.locationId, "modulo-bloqueado");

    // Empresa suspensa não responde: o webhook roda com service role, então a
    // suspensão da 0051 (que vive na RLS) não chega aqui. Suspender quem parou
    // de pagar tem que parar o gasto de OPENAI_API_KEY e da credencial global
    // do provedor, senão o inadimplente segue consumindo crédito do dono da
    // plataforma. Só esta empresa é pulada — o webhook das demais continua
    // respondendo.
    if (await isLocationSuspended(p.locationId, db)) return sair(p.locationId, "empresa-suspensa");

    // handoff: humano já assumiu esta conversa?
    const { data: conv } = await db
      .from("conversations")
      .select("bot_paused")
      .eq("id", p.conversationId)
      .maybeSingle();
    if (!conv || conv.bot_paused) return sair(p.locationId, "bot-pausado");

    // agente principal ATIVO da empresa
    const { data: agent } = await db
      .from("ai_agents")
      .select("personality, goal, extra_info, model")
      .eq("location_id", p.locationId)
      .eq("is_primary", true)
      .eq("status", "ativo")
      .maybeSingle();
    if (!agent) return sair(p.locationId, "sem-agente-ativo");

    // limite diário do canal (conta saídas de hoje)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", p.channelId)
      .eq("direction", "out")
      .gte("created_at", startOfDay.toISOString());
    if ((count ?? 0) >= p.dailyLimit) return sair(p.locationId, "limite-diario");

    // histórico (últimas 10, ordem cronológica)
    const { data: rows } = await db
      .from("messages")
      .select("id, direction, type, body, media_path, media_mime, media_size, media_transcript, created_at")
      .eq("conversation_id", p.conversationId)
      .order("created_at", { ascending: false })
      .limit(10);
    const history: any[] = (rows ?? []).slice().reverse();

    // Mídia de entrada: processada só agora, DEPOIS de todas as guardas acima
    // (chave, módulo, suspensão, bot_paused, agente, limite diário) — nesta
    // ordem porque é aqui que se gasta Whisper/Vision, crédito global do dono
    // da plataforma. A mensagem mais recente do histórico é a que disparou
    // esta chamada.
    const incoming = history[history.length - 1];
    // URL assinada de curta duração da imagem de entrada, quando houver —
    // NUNCA logar. Presença dela é o sinal de "há imagem nesta rodada", usado
    // abaixo para acrescentar a TRAVA_IMAGEM ao fim do system e montar o
    // conteúdo multimodal da mensagem do usuário.
    let imagemUrlAssinada: string | undefined;
    if (incoming && incoming.direction === "in" && incoming.type === "audio") {
      if (incoming.media_transcript) {
        // Reentrega do gateway: já transcrita, não paga o Whisper de novo.
        incoming.body = incoming.media_transcript;
      } else {
        const duracao = p.audioSeconds;
        const tetoEstourado =
          (typeof duracao === "number" && duracao > TETO_AUDIO_SEGUNDOS) ||
          (typeof incoming.media_size === "number" && incoming.media_size > TETO_AUDIO_BYTES);

        if (tetoEstourado || !incoming.media_path) {
          // Acima do teto: nem baixa — o download é o gasto, checar depois
          // não adianta. Motivo distinto de "transcricao-falhou": aqui não
          // houve tentativa de download/Whisper, é decisão de custo — as duas
          // situações pedem ações opostas (ajustar teto x investigar erro).
          sair(p.locationId, "audio-acima-do-teto");
          incoming.body = AUDIO_NAO_INTERPRETADO;
        } else {
          try {
            const { data: file, error: dlErr } = await db.storage
              .from("conversation-media")
              .download(incoming.media_path);
            if (dlErr || !file) throw dlErr || new Error("download vazio");
            const bytes = await file.arrayBuffer();
            const ext = String(incoming.media_mime ?? "")
              .split(";")[0]
              .split("/")[1]
              ?.trim() || "ogg";
            const texto = await transcreverAudio(bytes, `audio.${ext}`);
            incoming.body = texto;
            // Grava para não pagar de novo numa reentrega. Best-effort: se a
            // escrita falhar, a resposta desta rodada já usa o texto certo.
            await db
              .from("messages")
              .update({ media_transcript: texto })
              .eq("id", incoming.id)
              .then(
                () => {},
                () => {},
              );
          } catch {
            // Download ou Whisper falharam: nunca emudece a IA — responde
            // como mídia não interpretada. Sem conteúdo do áudio nem nome de
            // arquivo do cliente no log.
            sair(p.locationId, "transcricao-falhou");
            incoming.body = AUDIO_NAO_INTERPRETADO;
          }
        }
      }
    } else if (incoming && incoming.direction === "in" && incoming.type === "image") {
      // Imagem de entrada: nenhum byte passa pela nossa função — geramos uma
      // URL assinada de curta duração (120s) do bucket privado e mandamos só
      // a URL pra OpenAI enxergar. Mídia sem media_path é mídia que falhou no
      // webhook (já teria virado type="text" com rótulo lá, mas a checagem
      // aqui é defensiva, não confia só nisso).
      if (!incoming.media_path) {
        incoming.body = incoming.body || IMAGEM_NAO_INTERPRETADA;
      } else {
        try {
          const { data: signed, error: signErr } = await db.storage
            .from("conversation-media")
            .createSignedUrl(incoming.media_path, URL_IMAGEM_TTL_SEGUNDOS);
          if (signErr || !signed?.signedUrl) throw signErr || new Error("sem signed url");
          imagemUrlAssinada = signed.signedUrl;
        } catch {
          // Nunca logar a URL nem o erro do storage (pode ecoar caminho/token).
          sair(p.locationId, "imagem-sem-url-assinada");
          incoming.body = IMAGEM_NAO_INTERPRETADA;
        }
      }
    } else if (
      incoming &&
      incoming.direction === "in" &&
      (incoming.type === "video" || incoming.type === "file")
    ) {
      // Vídeo e documento NÃO são interpretados: a IA só reconhece o
      // recebimento (o texto de fato vem do modelo, guiado por este rótulo) e
      // o bot NÃO pausa — pausar deixaria a conversa muda pra sempre depois
      // de um único anexo, hoje não existe como despausar.
      incoming.body = incoming.type === "video" ? VIDEO_RECEBIDO : DOCUMENTO_RECEBIDO;
    }

    const parts = [
      agent.personality,
      agent.goal ? `Objetivo: ${agent.goal}` : "",
      agent.extra_info ? `Informações: ${agent.extra_info}` : "",
    ].filter((s: string) => s && s.trim());
    let system = parts.join("\n\n") || "Você é um assistente prestativo.";
    // A trava é acrescentada DEPOIS do texto do agente (personalidade,
    // objetivo, informações — tudo configurado pelo cliente), nunca antes:
    // uma personalidade mais assertiva escrita pelo cliente poderia atropelar
    // uma instrução que viesse primeiro. Só entra quando há imagem nesta
    // rodada.
    if (imagemUrlAssinada) {
      system = `${system}\n\n${TRAVA_IMAGEM}`;
    }

    type ParteConteudo =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };

    const messages: { role: "system" | "user" | "assistant"; content: string | ParteConteudo[] }[] = [
      { role: "system", content: system },
      ...history.map((m) => {
        const role = m.direction === "out" ? ("assistant" as const) : ("user" as const);
        if (m === incoming && imagemUrlAssinada) {
          const legenda = String(m.body ?? "").trim();
          const partes: ParteConteudo[] = [];
          if (legenda) partes.push({ type: "text", text: legenda });
          partes.push({ type: "image_url", image_url: { url: imagemUrlAssinada } });
          return { role, content: partes };
        }
        return { role, content: String(m.body ?? "") };
      }),
    ];

    let result;
    try {
      result = await chat(messages, { model: agent.model });
    } catch {
      return sair(p.locationId, "openai-falhou");
    }
    const reply = (result.text ?? "").trim();
    if (!reply) return sair(p.locationId, "resposta-vazia");

    // envia pelo helper único (resolve provedor, checa connection_state e
    // busca o token da instância — ver src/lib/whatsapp/enviar.ts)
    const envio = await enviarTexto(db, p.channelId, p.toPhone, reply);
    if (!envio.ok) return sair(p.locationId, `envio-falhou:${envio.motivo}`);
    const waMessageId = envio.waMessageId;

    // grava a saída + atualiza a conversa (mesma forma do /api/whatsapp/send)
    const { data: msg } = await db
      .from("messages")
      .insert({
        location_id: p.locationId,
        conversation_id: p.conversationId,
        direction: "out",
        type: "text",
        channel: "whatsapp",
        body: reply,
        channel_id: p.channelId,
        wa_message_id: waMessageId,
        status: "sent",
      })
      .select("created_at")
      .single();
    await db
      .from("conversations")
      .update({
        last_message_at: msg?.created_at ?? new Date().toISOString(),
        last_message_preview: reply,
      })
      .eq("id", p.conversationId);

    // log (best-effort; created_by null = máquina)
    const lastUser = [...history].reverse().find((m) => m.direction === "in");
    await db.from("ai_logs").insert({
      location_id: p.locationId,
      feature: "whatsapp-auto",
      model: agent.model,
      prompt: String(lastUser?.body ?? ""),
      response: reply,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      created_by: null,
    });
  } catch {
    // best-effort absoluto: nunca propaga pro webhook
  }
}
