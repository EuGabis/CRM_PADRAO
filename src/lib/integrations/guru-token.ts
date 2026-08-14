import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve o User Token da Guru da empresa de quem está chamando a rota.
 *
 * Duas etapas, de propósito (o motivo já custou dois bugs em produção):
 *   1. AUTORIZAÇÃO com a sessão do usuário — só responde a quem é membro da
 *      empresa (a RLS de `location_members` garante isso).
 *   2. LEITURA DO TOKEN com a service role. `payment_credentials` é admin-only
 *      desde a 0008 e continua sendo; ler com a sessão do usuário fazia as
 *      telas responderem "Guru não conectada" para todo mundo que não fosse
 *      administrador — a conexão é da EMPRESA, não de quem está logado.
 *
 * O token nunca sai daqui: quem chama usa para falar com a Guru no servidor e
 * devolve ao navegador só o resultado.
 */
export type GuruTokenResult =
  | { ok: true; token: string; locationId: string }
  | { ok: false; response: Response };

export async function resolveGuruUserToken(): Promise<GuruTokenResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, response: Response.json({ error: "não autenticado" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return {
      ok: false,
      response: Response.json({ error: "empresa não encontrada" }, { status: 404 }),
    };
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "servidor sem credenciais" }, { status: 503 }),
    };
  }

  const { data: credential } = await db
    .from("payment_credentials")
    .select("api_key")
    .eq("location_id", membership.location_id)
    .eq("provider", "guru")
    .maybeSingle();
  if (!credential?.api_key) {
    return {
      ok: false,
      response: Response.json(
        { error: "Guru não conectada ou sem User Token salvo" },
        { status: 409 }
      ),
    };
  }

  return { ok: true, token: credential.api_key, locationId: membership.location_id };
}
