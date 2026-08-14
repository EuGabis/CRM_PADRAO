import { resolveGuruUserToken } from "@/lib/integrations/guru-token";
import { fetchGuruProducts } from "@/lib/integrations/guru";

/**
 * Proxy autenticado pro catálogo de produtos da Guru (GET /api/v2/products).
 * O User Token nunca pode ir para o navegador (a própria Guru pede isso na
 * doc), então quem fala com a Guru é o servidor — ver `resolveGuruUserToken`.
 */
export async function GET() {
  const auth = await resolveGuruUserToken();
  if (!auth.ok) return auth.response;

  try {
    const { items, truncated } = await fetchGuruProducts(auth.token);
    return Response.json({ products: items, truncated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "falha ao consultar a Guru" },
      { status: 502 }
    );
  }
}
