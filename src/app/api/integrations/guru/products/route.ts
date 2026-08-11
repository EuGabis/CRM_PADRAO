import { createClient } from "@/lib/supabase/server";
import { fetchGuruProducts } from "@/lib/integrations/guru";

/**
 * Proxy autenticado pro catálogo de produtos da Guru (GET /api/v2/products).
 * O User Token nunca pode ir para o navegador (a própria Guru pede isso na
 * doc) — esta rota roda no servidor com a sessão do usuário, lê o token de
 * `payment_credentials` (a RLS já restringe a leitura a admins da empresa)
 * e repassa o resultado.
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

  const { data: credential } = await supabase
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
