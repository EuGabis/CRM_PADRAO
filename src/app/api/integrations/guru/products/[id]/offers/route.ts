import { resolveGuruUserToken } from "@/lib/integrations/guru-token";
import { fetchGuruProductOffers } from "@/lib/integrations/guru";

/**
 * Ofertas de um produto (GET /api/v2/products/{id}/offers) — alimenta a aba
 * "Ofertas" do detalhe do produto em Pagamentos. Mesma regra do catálogo: o
 * User Token fica no servidor, o navegador recebe só a lista.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await resolveGuruUserToken();
  if (!auth.ok) return auth.response;

  try {
    const { items, truncated } = await fetchGuruProductOffers(auth.token, id);
    return Response.json({ offers: items, truncated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "falha ao consultar a Guru" },
      { status: 502 }
    );
  }
}
