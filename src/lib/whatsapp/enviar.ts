/**
 * Helper único de envio de texto por WhatsApp — bifurca por `channel.provider`
 * e entrega a mensagem pelo provedor certo. Faz **uma** coisa: entregar o
 * texto. Não aplica limite diário nem janela de 24h — essas regras pertencem
 * a quem chama, porque cada chamador as aplica em momento diferente (a
 * auto-resposta antes de gastar a OpenAI; a agendada na hora do disparo).
 * Helper que decide regra de negócio esconde a regra de quem precisa vê-la.
 *
 * `db` é o cliente service role: webhook e cron não têm sessão de usuário, e
 * desde a 0058 `evolution_instance`/`evolution_token` só são legíveis por ele.
 *
 * Padrão copiado de `src/app/api/whatsapp/send/route.ts`, que já bifurca por
 * provedor.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendText } from "@/lib/whatsapp/client";
import { sendText as sendEvolutionText } from "@/lib/evolution/client";

export type ResultadoEnvio =
  | { ok: true; waMessageId: string | null }
  | { ok: false; motivo: string };

export async function enviarTexto(
  db: any,
  channelId: string,
  paraE164: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const { data: channel } = await db
    .from("whatsapp_channels")
    .select(
      "id, provider, phone_number_id, evolution_instance, evolution_token, connection_state, active",
    )
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return { ok: false, motivo: "canal-nao-encontrado" };
  if (!channel.active) return { ok: false, motivo: "canal-inativo" };

  if (channel.provider === "evolution") {
    if (channel.connection_state !== "open") return { ok: false, motivo: "desconectado" };
    if (!channel.evolution_instance || !channel.evolution_token) {
      return { ok: false, motivo: "sem-instancia" };
    }
    try {
      const resp = await sendEvolutionText(
        channel.evolution_instance,
        channel.evolution_token,
        paraE164,
        texto,
      );
      return { ok: true, waMessageId: resp.id || null };
    } catch {
      // Não repassa a mensagem crua: o erro da Evolution ecoa o nome da
      // instância no path. Não loga conteúdo, token ou URL — só o código.
      console.error("[whatsapp/enviar] falha ao enviar via evolution", { channelId });
      return { ok: false, motivo: "falha-envio" };
    }
  }

  // provider nulo ("meta" legado) ou "meta" explícito caem aqui — default
  // seguro para canal legado, que sempre teve `provider` nulo no banco.
  if (!channel.phone_number_id) return { ok: false, motivo: "sem-instancia" };
  try {
    const resp: any = await sendText(channel.phone_number_id, paraE164, texto);
    return { ok: true, waMessageId: resp?.messages?.[0]?.id ?? null };
  } catch {
    console.error("[whatsapp/enviar] falha ao enviar via meta", { channelId });
    return { ok: false, motivo: "falha-envio" };
  }
}
