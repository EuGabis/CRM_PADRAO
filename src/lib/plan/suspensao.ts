import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Suspensão precisa parar o GASTO, não só o acesso à tela.
 *
 * Os motores de fundo (campanhas, automações, mensagens agendadas, auto-resposta
 * do WhatsApp) rodam com service role: a RLS não os alcança, então a suspensão
 * que a 0051 aplicou em `private.user_locations()` não os afeta. Sem esta
 * checagem, a empresa que parou de pagar continua disparando e-mail na
 * RESEND_API_KEY, chamada de IA na OPENAI_API_KEY e mensagem no WHATSAPP_TOKEN —
 * todas globais, todas na conta do dono da plataforma. Suspender o inadimplente
 * sem cortar o consumo dele é o pior dos dois mundos.
 *
 * Quem chama SEMPRE pula só a empresa suspensa (`continue`) e segue processando
 * as outras — abortar o tick derrubaria o envio de todo mundo por causa de um
 * inadimplente.
 */

/**
 * Ids suspensos dentro do lote. Erro na consulta = trata TODAS como suspensas,
 * pelo mesmo motivo de `assertModuleEnabled`: falhar aberto deixaria o consumo
 * cair na conta do dono em silêncio. Nada se perde — o trabalho não é reivindicado
 * e o próximo tick tenta de novo.
 */
export async function suspendedLocationIds(
  db: any,
  locationIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(locationIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  const { data, error } = await db
    .from("locations")
    .select("id, suspended_at")
    .in("id", ids);

  if (error) return new Set(ids);

  const suspensas = new Set<string>();
  for (const l of (data ?? []) as any[]) {
    if (l.suspended_at) suspensas.add(l.id);
  }
  return suspensas;
}

/** Versão de uma empresa só, para os caminhos que já sabem a location. */
export async function isLocationSuspended(
  locationId: string,
  db?: any
): Promise<boolean> {
  const client = db ?? createAdminClient();
  const suspensas = await suspendedLocationIds(client, [locationId]);
  return suspensas.has(locationId);
}
