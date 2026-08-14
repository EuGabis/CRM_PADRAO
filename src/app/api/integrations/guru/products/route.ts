import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGuruProducts } from "@/lib/integrations/guru";

/**
 * Proxy autenticado pro catálogo de produtos da Guru (GET /api/v2/products).
 * O User Token nunca pode ir para o navegador (a própria Guru pede isso na
 * doc), então quem fala com a Guru é o servidor.
 *
 * Duas etapas, de propósito:
 *   1. AUTORIZAÇÃO com a sessão do usuário — só responde a quem é membro da
 *      empresa (a RLS de `location_members` garante isso).
 *   2. LEITURA DO TOKEN com a service role. `payment_credentials` é admin-only
 *      (0008) e continua sendo; ler com a sessão do usuário fazia a aba
 *      Produtos responder "Guru não conectada" para todo mundo que não fosse
 *      administrador — a conexão é da empresa, não de quem está logado.
 *      O token não sai daqui: para o cliente vai só a lista de produtos.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return Response.json({ error: "não autenticado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return Response.json({ error: "empresa não encontrada" }, { status: 404 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "servidor sem credenciais" }, { status: 503 });
  }

  const { data: credential } = await db
    .from("payment_credentials")
    .select("api_key")
    .eq("location_id", membership.location_id)
    .eq("provider", "guru")
    .maybeSingle();
  if (!credential?.api_key) {
    return Response.json(
      { error: "Guru não conectada ou sem User Token salvo" },
      { status: 409 }
    );
  }

  try {
    const { items, truncated } = await fetchGuruProducts(credential.api_key);
    return Response.json({ products: items, truncated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "falha ao consultar a Guru" },
      { status: 502 }
    );
  }
}
