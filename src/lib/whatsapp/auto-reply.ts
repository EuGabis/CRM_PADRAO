import { chat } from "@/lib/ai/openai";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { isLocationSuspended } from "@/lib/plan/suspensao";
import { enviarTexto } from "@/lib/whatsapp/enviar";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
      .select("direction, body, created_at")
      .eq("conversation_id", p.conversationId)
      .order("created_at", { ascending: false })
      .limit(10);
    const history: any[] = (rows ?? []).slice().reverse();

    const parts = [
      agent.personality,
      agent.goal ? `Objetivo: ${agent.goal}` : "",
      agent.extra_info ? `Informações: ${agent.extra_info}` : "",
    ].filter((s: string) => s && s.trim());
    const system = parts.join("\n\n") || "Você é um assistente prestativo.";

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      ...history.map((m) => ({
        role: m.direction === "out" ? ("assistant" as const) : ("user" as const),
        content: String(m.body ?? ""),
      })),
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
