import { createClient } from "@/lib/supabase/server";

/**
 * Portão das rotas de plataforma. Valida a sessão e confirma que o usuário
 * está em private.platform_admins.
 *
 * A checagem vai pelo RPC com a sessão do usuário — não com a service role.
 * Com service role, `auth.uid()` é nulo e a função responderia sempre false,
 * o que travaria tudo; e aceitar um id vindo do request deixaria o chamador
 * escolher quem ele é.
 */
export async function requirePlatformAdmin(): Promise<
  { ok: true } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: Response.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data, error } = await supabase.rpc("is_platform_admin_check");
  if (error || data !== true) {
    return { ok: false, response: Response.json({ error: "Sem acesso" }, { status: 403 }) };
  }
  return { ok: true };
}
