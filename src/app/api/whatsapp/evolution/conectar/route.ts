import { randomBytes, randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createInstance, connectInstance, deleteInstance } from "@/lib/evolution/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

const WEBHOOK_URL = "https://crm-padrao.vercel.app/api/whatsapp/evolution/webhook";

/**
 * Conecta um canal Evolution (WhatsApp não oficial) por QR code.
 *
 * Sem `channelId`: cria um canal novo e uma instância nova no gateway.
 * Com `channelId`: reconecta um canal Evolution já existente (não cria
 * instância nova — só pede um QR novo pra que já existe).
 *
 * O nome da instância (`crmon-{id}`) é sempre derivado no servidor a partir
 * do id da própria linha — nunca aceito do cliente. É essa derivação que
 * garante que o CRM nunca colide com a instância `Teste` de outro projeto
 * que roda no mesmo gateway.
 *
 * Nota sobre a ordem: a `0057` exige `evolution_instance` preenchido sempre
 * que `provider = 'evolution'` (constraint de coerência) — não dá pra criar
 * a linha primeiro e preencher depois. Por isso o id é gerado aqui (
 * `randomUUID()`, não o `gen_random_uuid()` do banco) e a instância já entra
 * derivada dele no mesmo insert. Continua sendo o servidor quem decide o
 * nome; o cliente nunca escolhe.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }

  // location_id NUNCA vem do corpo — o cliente escolheria a empresa de outro.
  const { data: membership } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const locationId = (membership as any)?.location_id ?? null;
  if (!locationId) return Response.json({ error: "Empresa não encontrada" }, { status: 403 });

  const channelIdInput = typeof body?.channelId === "string" ? body.channelId.trim() : "";

  // ------------------------------------------------------------
  // Caminho de reconectar: canal já existe, só pede um QR novo.
  // ------------------------------------------------------------
  if (channelIdInput) {
    const { data: channel } = await supabase
      .from("whatsapp_channels")
      .select("id, location_id, provider, evolution_instance")
      .eq("id", channelIdInput)
      .maybeSingle();

    if (!channel || channel.location_id !== locationId || channel.provider !== "evolution") {
      return Response.json({ error: "Canal não encontrado" }, { status: 404 });
    }
    const instancia = channel.evolution_instance as string;

    try {
      const { qrBase64, state } = await connectInstance(instancia);
      await supabase.from("whatsapp_channels").update({ connection_state: state }).eq("id", channel.id);
      return Response.json({ channelId: channel.id, instancia, qrBase64, state });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Falha ao pedir o QR" },
        { status: 502 },
      );
    }
  }

  // ------------------------------------------------------------
  // Caminho de criar: canal novo + instância nova no gateway.
  // ------------------------------------------------------------
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (!nome) return Response.json({ error: "Informe o nome do canal" }, { status: 400 });

  const channelId = randomUUID();
  const instancia = `crmon-${channelId}`;

  const { error: createChannelError } = await supabase.from("whatsapp_channels").insert({
    id: channelId,
    location_id: locationId,
    name: nome,
    provider: "evolution",
    evolution_instance: instancia,
  });

  if (createChannelError) {
    // Mensagem do trigger de limite (0048) já é legível pro cliente — repassa como está.
    if (createChannelError.message?.includes("LIMITE_CANAIS")) {
      return Response.json({ error: createChannelError.message }, { status: 400 });
    }
    return Response.json(
      { error: `Não foi possível criar o canal (${createChannelError.message}).` },
      { status: 500 },
    );
  }

  const webhookSecret = randomBytes(24).toString("hex"); // 48 caracteres

  let token: string;
  try {
    const created = await createInstance(instancia, WEBHOOK_URL, webhookSecret);
    token = created.token;
  } catch (e) {
    // createInstance já se autocompensa no gateway se o passo do webhook falhar
    // (apaga a instância que acabou de criar). O que sobra pra nós desfazer
    // aqui é só o canal que criamos no passo anterior.
    await supabase.from("whatsapp_channels").delete().eq("id", channelId);
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao criar a instância no gateway" },
      { status: 502 },
    );
  }

  // A partir daqui a instância EXISTE no gateway — qualquer falha precisa
  // compensar com deleteInstance, senão fica órfã consumindo recurso do
  // gateway compartilhado.
  const { error: saveTokenError } = await supabase
    .from("whatsapp_channels")
    .update({ evolution_token: token, webhook_secret: webhookSecret })
    .eq("id", channelId);

  if (saveTokenError) {
    return await compensarECancelar(
      supabase,
      channelId,
      instancia,
      `Falha ao salvar as credenciais do canal (${saveTokenError.message}).`,
    );
  }

  try {
    const { qrBase64, state } = await connectInstance(instancia);
    await supabase.from("whatsapp_channels").update({ connection_state: state }).eq("id", channelId);
    return Response.json({ channelId, instancia, qrBase64, state });
  } catch (e) {
    return await compensarECancelar(
      supabase,
      channelId,
      instancia,
      `Falha ao pedir o QR (${e instanceof Error ? e.message : "erro desconhecido"}).`,
    );
  }
}

/**
 * Desfaz uma criação que já tem instância no gateway mas não terminou de
 * gravar no banco: apaga a instância e o canal. Se a exclusão da instância
 * também falhar, a resposta PRECISA dizer isso com o nome da instância —
 * afirmar que ficou tudo limpo sem ter confirmado é pior que a falha em si.
 */
async function compensarECancelar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  channelId: string,
  instancia: string,
  motivo: string,
): Promise<Response> {
  let deleteInstanceFailed = false;
  try {
    await deleteInstance(instancia);
  } catch {
    deleteInstanceFailed = true;
  }
  await supabase.from("whatsapp_channels").delete().eq("id", channelId);

  return Response.json(
    {
      error: deleteInstanceFailed
        ? `${motivo} A limpeza automática da instância "${instancia}" também falhou — ela ficou órfã no gateway, apague manualmente.`
        : `${motivo} A instância foi desfeita automaticamente.`,
    },
    { status: 500 },
  );
}
