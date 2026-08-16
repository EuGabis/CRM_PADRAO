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
  const { data, error } = await db
    .from("location_limits")
    .select("disabled_modules")
    .eq("location_id", locationId)
    .maybeSingle();

  // Falha FECHADO de propósito: esta função é a única barreira entre uma
  // empresa cliente e chaves globais (OPENAI_API_KEY, RESEND_API_KEY,
  // WHATSAPP_TOKEN) — o consumo de qualquer cliente cai na conta do dono da
  // plataforma. Se a consulta falhar (RLS mudada, erro transitório, coluna
  // renomeada), tratar como lista vazia liberaria o módulo em silêncio. Por
  // isso recusamos aqui: é falha ao verificar o plano, não módulo bloqueado
  // (a mensagem deixa isso explícito para não mandar quem for depurar para
  // o lugar errado).
  if (error) {
    return `Não foi possível verificar o plano desta empresa (falha na consulta). Tente novamente em instantes.`;
  }

  const bloqueados: string[] = data?.disabled_modules ?? [];
  if (bloqueados.includes(moduleKey)) {
    return `O módulo ${moduleKey} não está incluído no plano desta empresa.`;
  }
  return null;
}
