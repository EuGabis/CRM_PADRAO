import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role — ignora RLS.
 *
 * NUNCA importar em componente client: a chave só existe no servidor
 * (sem prefixo NEXT_PUBLIC_). Usado apenas pelo motor de automações,
 * que precisa ler/escrever em nome de qualquer empresa sem sessão de usuário.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Motor de automações sem credenciais: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
