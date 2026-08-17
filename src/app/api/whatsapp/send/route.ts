import { createClient } from "@/lib/supabase/server";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { sendText, sendTemplate } from "@/lib/whatsapp/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Envia mensagem de WhatsApp. Autenticada (getUser + a RLS garante que o
 * usuário é membro da empresa da conversa). Bifurca por `channel.provider`:
 *
 * - `meta` (Cloud API oficial): dentro da janela de 24h manda texto livre,
 *   fora exige template aprovado — regras da Meta, só valem aqui.
 * - `evolution` (gateway próprio/Baileys): não existe janela nem template;
 *   exige que o canal esteja com `connection_state = "open"`.
 *
 * O limite diário (`daily_limit`) é regra do produto e vale nos dois
 * caminhos.
 */
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
  const { conversationId, channelId, text, template } = body ?? {};
  if (!conversationId) return Response.json({ error: "conversationId ausente" }, { status: 400 });

  // conversa (RLS filtra por membership)
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id, location_id, channel_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });

  // WHATSAPP_TOKEN é global (conta do dono da plataforma): empresa com o módulo
  // bloqueado não pode gastar. A location vem da conversa, que passou pela RLS
  // — nunca do corpo do request, senão o cliente escolheria a empresa checada.
  const bloqueio = await assertModuleEnabled(conv.location_id, "whatsapp");
  if (bloqueio) return Response.json({ error: bloqueio }, { status: 403 });

  // ⚠️ PROBLEMA DE ARQUITETURA (não resolvido aqui — reportado na revisão da
  // Task 6): esta rota roda com a sessão do usuário (RLS), e depois da 0058
  // `evolution_token` deixou de ser uma coluna legível por `authenticated`.
  // O envio pelo provedor `evolution` (abaixo, `sendEvolutionText`) precisa
  // desse token e portanto está quebrado até essa decisão de arquitetura ser
  // tomada — ex.: replicar o padrão de `google-ads/overview/route.ts`
  // (colunas públicas pela sessão do usuário + segredo buscado à parte com
  // `createAdminClient()`, usando o `channel.id` já validado pela RLS acima).
  const { data: channel } = await supabase
    .from("whatsapp_channels")
    .select("id, provider, phone_number_id, evolution_instance, connection_state, active, daily_limit")
    .eq("id", channelId ?? conv.channel_id)
    .maybeSingle();
  if (!channel || !channel.active) {
    return Response.json({ error: "Canal de WhatsApp inválido ou inativo" }, { status: 400 });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", conv.contact_id)
    .maybeSingle();
  const to = (contact?.phone ?? "").replace(/\D/g, "");
  if (!to) return Response.json({ error: "Contato sem telefone" }, { status: 400 });

  // limite diário (conta saídas do canal hoje)
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

  let waMessageId: string | null;
  let bodyText: string;

  if (channel.provider === "evolution") {
    // Sem janela de 24h e sem template nesse provedor — checagem exclusiva
    // do caminho `meta`, não se aplica aqui.
    if (channel.connection_state !== "open") {
      return Response.json(
        {
          error:
            "WhatsApp desconectado — reconecte o canal (escaneie o QR novamente) antes de enviar.",
        },
        { status: 409 },
      );
    }
    if (!text?.trim()) return Response.json({ error: "Mensagem vazia" }, { status: 400 });

    // `evolution_token` é segredo e, desde a 0058, não é mais lido pela
    // sessão do usuário (só a service role lê essa coluna) — ver comentário
    // acima da query do canal. Esta rota roda com a sessão do usuário, então
    // não tem mais como chamar `sendEvolutionText`: falha explícita em vez
    // de mandar `undefined` pro gateway em silêncio, até a decisão de
    // arquitetura (ex.: buscar o token à parte com `createAdminClient()`,
    // como `google-ads/overview/route.ts` já faz para `refresh_token`).
    return Response.json(
      {
        error:
          "Envio pela Evolution API está temporariamente indisponível nesta rota — pendente de decisão de arquitetura (evolution_token é segredo e não pode mais ser lido pela sessão do usuário).",
      },
      { status: 501 },
    );
  } else {
    // caminho `meta` (Cloud API oficial) — comportamento original, intocado.

    // janela de 24h = última mensagem de entrada
    const { data: lastIn } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const within24h =
      !!lastIn && Date.now() - new Date(lastIn.created_at).getTime() < DAY_MS;

    let waResp: any;
    try {
      if (template) {
        waResp = await sendTemplate(
          channel.phone_number_id,
          to,
          template.name,
          template.language,
          template.components,
        );
        bodyText = `[template: ${template.name}]`;
      } else {
        if (!within24h) {
          return Response.json(
            { error: "Janela de 24h fechada — envie um template", needsTemplate: true },
            { status: 409 },
          );
        }
        if (!text?.trim()) return Response.json({ error: "Mensagem vazia" }, { status: 400 });
        waResp = await sendText(channel.phone_number_id, to, text.trim());
        bodyText = text.trim();
      }
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Falha na Cloud API" },
        { status: 502 },
      );
    }

    waMessageId = waResp?.messages?.[0]?.id ?? null;
  }

  const { data: msg, error: insErr } = await supabase
    .from("messages")
    .insert({
      location_id: conv.location_id,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      channel: "whatsapp",
      body: bodyText,
      channel_id: channel.id,
      wa_message_id: waMessageId,
      status: "sent",
      template_name: template ? template.name : null,
    })
    .select()
    .single();
  if (insErr || !msg) {
    return Response.json({ error: "Enviado, mas falhou ao gravar a mensagem" }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: msg.created_at,
      last_message_preview: bodyText,
      sla_days: 0,
      bot_paused: true,
    })
    .eq("id", conversationId);

  return Response.json({ ok: true, id: msg.id, waMessageId, message: msg });
}
