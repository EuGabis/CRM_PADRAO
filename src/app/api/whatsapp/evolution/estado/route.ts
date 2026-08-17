import { createClient } from "@/lib/supabase/server";
import { connectionState } from "@/lib/evolution/client";
import { assertModuleEnabled } from "@/lib/plan/guard";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/**
 * Consulta o estado REAL de um canal Evolution no gateway e sincroniza a
 * coluna `connection_state` (e `disconnected_at`) — sem pedir QR novo, sem
 * criar/tocar instância.
 *
 * Existe porque o webhook (`CONNECTION_UPDATE`) pode se perder: se o CRM só
 * confiasse nele, um canal caído continuaria marcado como conectado até a
 * próxima entrega de sorte. `whatsapp.ts` chama esta rota ao carregar a lista
 * de canais, para cada canal Evolution, e corrige a divergência.
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
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }
  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  if (!channelId) return Response.json({ error: "Informe o channelId" }, { status: 400 });

  // location_id NUNCA vem do corpo — mesmo padrão de /evolution/conectar.
  const { data: membership } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const locationId = (membership as any)?.location_id ?? null;
  if (!locationId) return Response.json({ error: "Empresa não encontrada" }, { status: 403 });

  const bloqueio = await assertModuleEnabled(locationId, "whatsapp");
  if (bloqueio) return Response.json({ error: bloqueio }, { status: 403 });

  const { data: channel } = await supabase
    .from("whatsapp_channels")
    .select("id, location_id, provider, evolution_instance, connection_state, disconnected_at")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel || channel.location_id !== locationId || channel.provider !== "evolution") {
    return Response.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  let state: string;
  try {
    state = await connectionState(channel.evolution_instance as string);
  } catch {
    return Response.json({ error: "Falha ao consultar o gateway" }, { status: 502 });
  }

  // Só carimba disconnected_at no momento em que sai de "open" — mesma regra
  // do webhook (handleConnectionUpdate) para não empurrar o carimbo pra
  // frente a cada reconciliação de um canal que já estava caído.
  let disconnectedAt = channel.disconnected_at as string | null;
  if (state === "open") {
    disconnectedAt = null;
  } else if (channel.connection_state === "open") {
    disconnectedAt = new Date().toISOString();
  }

  if (state !== channel.connection_state || disconnectedAt !== channel.disconnected_at) {
    const { error } = await supabase
      .from("whatsapp_channels")
      .update({ connection_state: state, disconnected_at: disconnectedAt })
      .eq("id", channelId);
    if (error) {
      console.error(`[whatsapp/evolution/estado] falha ao gravar estado do canal ${channelId}:`, error);
    }
  }

  return Response.json({ state, disconnectedAt });
}
