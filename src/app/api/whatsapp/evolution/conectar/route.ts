import { randomBytes, randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createInstance, connectInstance, deleteInstance } from "@/lib/evolution/client";
import { assertModuleEnabled } from "@/lib/plan/guard";

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

  // Mesma barreira das outras rotas de WhatsApp (send, send-media, templates):
  // a instância consome o gateway pago do dono da plataforma, então precisa
  // do módulo liberado ANTES de qualquer efeito colateral — criar canal,
  // criar instância ou até reconectar uma já existente.
  const bloqueio = await assertModuleEnabled(locationId, "whatsapp");
  if (bloqueio) return Response.json({ error: bloqueio }, { status: 403 });

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
      const { error: syncError } = await supabase
        .from("whatsapp_channels")
        .update({ connection_state: state })
        .eq("id", channel.id);
      if (syncError) {
        console.error(
          `[whatsapp/evolution/conectar] falha ao gravar connection_state do canal ${channel.id}:`,
          syncError,
        );
      }
      return Response.json({ channelId: channel.id, instancia, qrBase64, state });
    } catch {
      // Não repassa e.message cru: pode ser o corpo da própria requisição
      // ecoado pelo gateway numa mensagem de validação.
      return Response.json({ error: "Falha ao pedir o QR no gateway" }, { status: 502 });
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
    // Qualquer outro erro do Postgres fica só no log: o texto cru vaza nome de
    // constraint/coluna, que não é assunto do cliente.
    if (createChannelError.message?.includes("LIMITE_CANAIS")) {
      return Response.json({ error: createChannelError.message }, { status: 400 });
    }
    console.error(
      `[whatsapp/evolution/conectar] falha ao criar canal (location ${locationId}):`,
      createChannelError,
    );
    return Response.json({ error: "Não foi possível criar o canal." }, { status: 500 });
  }

  const webhookSecret = randomBytes(24).toString("hex"); // 48 caracteres

  let token: string;
  try {
    const created = await createInstance(instancia, WEBHOOK_URL, webhookSecret);
    token = created.token;
  } catch (e) {
    // createInstance já se autocompensa no gateway se o passo do webhook (ou
    // a falta de `hash`) falhar — apaga a instância que acabou de criar. O
    // que sobra pra nós desfazer aqui é só o canal que criamos no passo
    // anterior.
    //
    // Não repassa e.message ao cliente nem loga cru: o /webhook/set manda o
    // webhook_secret no corpo, e se o gateway ecoar esse corpo numa mensagem
    // de validação, o segredo vazaria na resposta HTTP ou no log do
    // servidor. Redige o valor do segredo antes de logar o detalhe.
    const detalhe = (e instanceof Error ? e.message : String(e)).split(webhookSecret).join("[segredo redigido]");
    console.error(`[whatsapp/evolution/conectar] falha ao criar instância "${instancia}" no gateway:`, detalhe);
    const { error: rollbackError } = await supabase.from("whatsapp_channels").delete().eq("id", channelId);
    if (rollbackError) {
      console.error(
        `[whatsapp/evolution/conectar] falha ao desfazer canal ${channelId} após erro no gateway:`,
        rollbackError,
      );
      return Response.json(
        {
          error:
            "Falha ao criar a instância no gateway, e o canal criado não pôde ser removido — " +
            `canal ${channelId} ficou para trás, apague manualmente.`,
        },
        { status: 500 },
      );
    }
    return Response.json({ error: "Falha ao criar a instância no gateway." }, { status: 502 });
  }

  // A partir daqui a instância EXISTE no gateway — qualquer falha precisa
  // compensar com deleteInstance, senão fica órfã consumindo recurso do
  // gateway compartilhado.
  const { error: saveTokenError } = await supabase
    .from("whatsapp_channels")
    .update({ evolution_token: token, webhook_secret: webhookSecret })
    .eq("id", channelId);

  if (saveTokenError) {
    console.error(
      `[whatsapp/evolution/conectar] falha ao salvar credenciais do canal ${channelId}:`,
      saveTokenError,
    );
    return await compensarECancelar(supabase, channelId, instancia, "Falha ao salvar as credenciais do canal.");
  }

  try {
    const { qrBase64, state } = await connectInstance(instancia);
    const { error: syncError } = await supabase
      .from("whatsapp_channels")
      .update({ connection_state: state })
      .eq("id", channelId);
    if (syncError) {
      console.error(
        `[whatsapp/evolution/conectar] falha ao gravar connection_state do canal ${channelId}:`,
        syncError,
      );
    }
    return Response.json({ channelId, instancia, qrBase64, state });
  } catch (e) {
    console.error(`[whatsapp/evolution/conectar] falha ao pedir QR de "${instancia}":`, e);
    return await compensarECancelar(supabase, channelId, instancia, "Falha ao pedir o QR no gateway.");
  }
}

/**
 * Desfaz uma criação que já tem instância no gateway mas não terminou de
 * gravar no banco: apaga a instância e o canal. Nenhuma das duas exclusões
 * pode ser assumida como sucesso sem checar o erro — afirmar limpeza que não
 * aconteceu é pior que a falha em si. Se sobrar alguma coisa (instância,
 * canal, ou as duas), a resposta cita exatamente o que ficou, com id/nome.
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
  } catch (e) {
    deleteInstanceFailed = true;
    console.error(`[whatsapp/evolution/conectar] falha ao apagar instância "${instancia}" no gateway:`, e);
  }

  const { error: deleteChannelError } = await supabase.from("whatsapp_channels").delete().eq("id", channelId);
  if (deleteChannelError) {
    console.error(`[whatsapp/evolution/conectar] falha ao apagar canal ${channelId}:`, deleteChannelError);
  }

  const pendencias: string[] = [];
  if (deleteInstanceFailed) pendencias.push(`a instância "${instancia}" ficou órfã no gateway`);
  if (deleteChannelError) pendencias.push(`o canal ${channelId} não foi removido`);

  return Response.json(
    {
      error: pendencias.length
        ? `${motivo} A limpeza automática falhou: ${pendencias.join(" e ")} — trate manualmente.`
        : `${motivo} A instância e o canal foram desfeitos automaticamente.`,
    },
    { status: 500 },
  );
}
