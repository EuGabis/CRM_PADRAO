import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recusa server-side de módulo bloqueado pelo plano.
 *
 * Lê com a service role de propósito: location_limits não tem policy de
 * escrita, mas a leitura com a sessão do usuário dependeria da RLS e de o
 * chamador ter membership resolvida. Aqui a autorização já aconteceu antes
 * (a rota validou a sessão); isto é só consulta de configuração.
 *
 * Devolve null quando liberado, ou a mensagem quando bloqueado.
 */
export async function assertModuleEnabled(
  locationId: string,
  moduleKey: string
): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("location_limits")
    .select("disabled_modules")
    .eq("location_id", locationId)
    .maybeSingle();

  const bloqueados: string[] = data?.disabled_modules ?? [];
  if (bloqueados.includes(moduleKey)) {
    return `O módulo ${moduleKey} não está incluído no plano desta empresa.`;
  }
  return null;
}
