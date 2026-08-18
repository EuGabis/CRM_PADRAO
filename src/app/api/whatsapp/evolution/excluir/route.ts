import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteInstance } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

/**
 * Exclui um canal Evolution: apaga a instância no gateway e depois o canal
 * no banco.
 *
 * ⚠️ Esta é a ÚNICA rota do CRM que apaga coisa no gateway, e o gateway
 * hospeda instâncias de outros projetos do dono da plataforma. Três travas,
 * nesta ordem, e nenhuma delas é dispensável:
 *
 * 1. O nome da instância NUNCA vem do request — vem da coluna
 *    `evolution_instance` do canal que a RLS já provou ser da empresa do
 *    usuário logado.
 * 2. O canal tem que pertencer à empresa do usuário (404 se não pertencer),
 *    senão um admin da empresa A apagaria o WhatsApp da empresa B.
 * 3. O nome tem que começar com `crmon-`. Se por qualquer motivo a coluna
 *    tiver sido gravada com outro valor, a rota recusa em vez de apagar —
 *    é a última linha de defesa contra apagar instância que não é nossa.
 *
 * A ordem (gateway primeiro, banco depois) é deliberada: se apagássemos o
 * canal antes e o gateway falhasse, a instância ficaria órfã e sem nenhum
 * registro apontando para ela — ninguém saberia mais que ela existe.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "payload inválido" }, { status: 400 });
  }
  const channelId =
    typeof (body as { channelId?: unknown })?.channelId === "string"
      ? (body as { channelId: string }).channelId
      : "";
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const { data: membro } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const locationId = membro?.location_id;
  if (!locationId) return Response.json({ error: "Empresa não encontrada" }, { status: 403 });

  const { data: channel } = await supabase
    .from("whatsapp_channels")
    .select("id, location_id, provider, evolution_instance")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.location_id !== locationId) {
    return Response.json({ error: "Canal não encontrado" }, { status: 404 });
  }
  if (channel.provider !== "evolution") {
    return Response.json(
      { error: "Este canal não é da Evolution — exclua pelo painel da Meta." },
      { status: 400 },
    );
  }

  const instancia = channel.evolution_instance as string | null;
  if (instancia && !instancia.startsWith("crmon-")) {
    console.error(
      `[whatsapp/evolution/excluir] recusado: instância "${instancia}" do canal ${channel.id} ` +
        `não tem o prefixo crmon- e pode não ser nossa`,
    );
    return Response.json(
      { error: "Instância com nome inesperado — exclusão bloqueada por segurança." },
      { status: 409 },
    );
  }

  // Instância que já não existe no gateway não impede apagar o canal: 404 lá
  // significa que o efeito desejado já vale. Qualquer outra falha aborta,
  // para não deixar instância viva sem registro no banco.
  if (instancia) {
    try {
      await deleteInstance(instancia);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const jaNaoExiste = msg.includes("404") || /not\s*found/i.test(msg);
      if (!jaNaoExiste) {
        console.error(`[whatsapp/evolution/excluir] falha ao apagar instância do canal ${channel.id}`);
        return Response.json(
          { error: "Não foi possível remover a conexão no gateway. Tente de novo." },
          { status: 502 },
        );
      }
    }
  }

  // As mensagens e conversas do canal têm FK para ele. Apagar é decisão do
  // dono do dado, mas o histórico não pode sumir junto por acidente: se o
  // delete falhar por FK, diga isso em vez de um erro genérico.
  const { error: delErro } = await supabase.from("whatsapp_channels").delete().eq("id", channel.id);
  if (delErro) {
    console.error(
      `[whatsapp/evolution/excluir] instância apagada mas o canal ${channel.id} permaneceu:`,
      delErro.code,
    );
    // Estado inconsistente e o usuário precisa saber: a conexão caiu, mas o
    // canal continua listado. Marca como desconectado para a tela não mentir.
    const admin = createAdminClient();
    await admin
      .from("whatsapp_channels")
      .update({ connection_state: "close", disconnected_at: new Date().toISOString() })
      .eq("id", channel.id);
    return Response.json(
      {
        error:
          "A conexão foi removida, mas o canal não pôde ser excluído porque tem conversas vinculadas.",
      },
      { status: 409 },
    );
  }

  return Response.json({ ok: true });
}
