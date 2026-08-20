import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarMidia } from "@/lib/evolution/client";
import {
  bytesDoPayload,
  limiteExcedido,
  type TipoMidia,
} from "@/lib/whatsapp/media-limits";
import { maybeAutoReply } from "@/lib/whatsapp/auto-reply";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Nunca cachear: cada chamada é um evento novo. */
export const dynamic = "force-dynamic";

/**
 * Webhook da Evolution (gateway próprio de WhatsApp não oficial, Baileys).
 * Fora do matcher do proxy — chamada máquina-a-máquina, sem sessão.
 *
 * A URL é ÚNICA e compartilhada por todos os canais Evolution do CRM (ver
 * WEBHOOK_URL em `evolution/conectar/route.ts`); quem distingue de qual canal
 * é o evento é o header `apikey`, que o gateway ecoa com o `webhook_secret`
 * configurado para aquela instância em `createInstance` (client.ts). O
 * gateway também hospeda instâncias de OUTROS projetos do dono — nenhuma
 * delas aponta pra cá de propósito, mas uma reconfiguração errada pode
 * mandar o evento aqui por engano; esse caso não é erro nosso, só ignora.
 *
 * Ordem de validação:
 *   1. Sem o header `apikey` -> 401 imediato, nem olha o corpo.
 *   2. Canal pela `evolution_instance` do payload. Não existe aqui -> 200 e
 *      ignora (pode ser instância de outro projeto/erro de config alheio).
 *   3. Canal existe -> compara (timing-safe) o header com o `webhook_secret`
 *      dele. Não bate -> 401 genérico, sem dizer o motivo.
 *   4. Só depois disso processa o evento.
 *
 * Formato do corpo: a sonda da Task 2 confirmou as rotas do gateway mas não
 * chegou a capturar um payload real de mensagem recebida (sem número
 * conectado no momento). Os campos abaixo (`event`, `instance`, `data.key`,
 * `data.message`, `data.pushName`) seguem o formato documentado da Evolution
 * API v2 (Baileys) — mas cada leitura é defensiva: campo ausente vira log
 * (só as CHAVES do payload, nunca o conteúdo da mensagem) e resposta 200,
 * nunca uma exceção que derruba o webhook.
 */
export async function POST(request: Request) {
  const secretHeader = request.headers.get("apikey");
  if (!secretHeader) {
    return new Response("não autorizado", { status: 401 });
  }

  let raw: string;
  let body: any;
  try {
    raw = await request.text();
    body = JSON.parse(raw);
  } catch {
    // Corpo ilegível: não é uma reentrega válida do gateway pra reprocessar.
    // Responde 200 pra não entrar em laço de retry por um payload que nunca
    // vai virar JSON válido.
    return Response.json({ ok: true });
  }

  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    console.error("[whatsapp/evolution/webhook] sem credenciais de admin no servidor:", e);
    return Response.json({ ok: true });
  }

  try {
    const instancia: string | undefined = body?.instance ?? body?.instanceName;
    if (!instancia) {
      console.error("[whatsapp/evolution/webhook] payload sem instância — chaves:", Object.keys(body ?? {}));
      return Response.json({ ok: true });
    }

    const { data: channel } = await db
      .from("whatsapp_channels")
      .select(
        "id, location_id, daily_limit, webhook_secret, connection_state, evolution_instance, evolution_token",
      )
      .eq("provider", "evolution")
      .eq("evolution_instance", instancia)
      .maybeSingle();

    // Canal desconhecido: pode ser instância de outro projeto do dono
    // apontando pra cá por engano de configuração. Não é erro nosso — ignora
    // sem gravar nada e sem vazar se a instância existe ou não além disso.
    // Mas LOGA: se for uma instância nossa que perdeu o registro no banco,
    // este é o único sinal de que a mensagem do cliente foi descartada. Só o
    // nome da instância (que já aparece nos outros logs), nunca o payload.
    if (!channel) {
      console.error(
        "[whatsapp/evolution/webhook] canal desconhecido — mensagem descartada; instância:",
        instancia,
      );
      return Response.json({ ok: true });
    }

    if (!validSecret(secretHeader, channel.webhook_secret)) {
      return new Response("não autorizado", { status: 401 });
    }

    const evento = String(body?.event ?? "")
      .toUpperCase()
      .replace(/[.\s]+/g, "_");

    if (evento === "MESSAGES_UPSERT") {
      const items = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
      for (const item of items) {
        try {
          await handleMessage(db, channel, item);
        } catch (e) {
          // Best-effort: uma mensagem malformada/sem suporte nunca derruba o webhook.
          // NUNCA logar o objeto de erro inteiro nem sua mensagem: erro de
          // tipo/constraint do Postgres ecoa o VALOR OFENSOR, que aqui pode
          // ser o conteúdo da mensagem do cliente final (dado de terceiro).
          console.error(
            "[whatsapp/evolution/webhook] falha ao processar mensagem — instância:",
            instancia,
            "código:",
            (e as any)?.code ?? "desconhecido",
          );
        }
      }
    } else if (evento === "CONNECTION_UPDATE") {
      try {
        await handleConnectionUpdate(db, channel, body);
      } catch (e) {
        // Idem: sem objeto de erro inteiro nem mensagem do Postgres no log.
        console.error(
          "[whatsapp/evolution/webhook] falha ao processar connection_update — instância:",
          instancia,
          "código:",
          (e as any)?.code ?? "desconhecido",
        );
      }
    }
    // Outros eventos: ignora silenciosamente (não assinados no webhook/set).

    return Response.json({ ok: true });
  } catch (e) {
    // Responde 200 mesmo em erro interno: webhook que responde erro faz o
    // gateway reentregar em laço.
    // Mesmo critério dos catches acima: nunca o objeto de erro inteiro nem
    // sua mensagem, só o código — pode ter chegado aqui vindo de uma
    // operação com dado de terceiro embutido no erro do Postgres.
    console.error(
      "[whatsapp/evolution/webhook] erro inesperado — código:",
      (e as any)?.code ?? "desconhecido",
    );
    return Response.json({ ok: true });
  }
}

function validSecret(header: string, expected: string | null): boolean {
  if (!expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleMessage(db: any, channel: any, item: any) {
  const key = item?.key ?? {};
  const waId: string | undefined = key.id;
  if (!waId) {
    console.error("[whatsapp/evolution/webhook] mensagem sem key.id — chaves:", Object.keys(item ?? {}));
    return;
  }

  // Mensagem enviada pelo próprio número (do celular, não pela API): o
  // Baileys ecoa no messages.upsert, mas não é uma mensagem de cliente pra
  // entrar no inbox como "in".
  //
  // `fromMe` nunca foi confirmado por sonda real (formato deduzido — ver
  // cabeçalho do arquivo). Checagem estrita, não por truthy: uma string
  // "false" não pode ser tratada como própria (descartaria mensagem real de
  // cliente em silêncio), e um `undefined` (campo ausente) também não pode
  // cair no "não é própria" sem deixar rastro — se o gateway omitir o campo
  // em algum tipo de evento, é melhor logar a suposição furada do que
  // duplicar a conversa do cliente com o eco da própria mensagem.
  if (key.fromMe === true || key.fromMe === "true") return;
  // `fromMe` ausente OU indefinido: grava a mensagem (não perder o dado do
  // cliente), mas nunca aciona a IA por ela. Sem essa cautela, um eco da
  // própria resposta da IA (se `sendText` devolver id vazio nesse mesmo
  // evento — caminho nunca confirmado por sonda) entraria como
  // `direction = "in"` e disparava uma nova auto-resposta: laço sem fim
  // gastando OPENAI_API_KEY e a chave global do gateway Evolution.
  //
  // Só `false` (ou a string "false") conta como "confirmadamente recebida".
  // Testar apenas `undefined` furava a proteção: a serialização
  // protobuf→JSON emite `null` com frequência, e `null` não é `true` nem
  // `undefined` — entrava como mensagem de cliente e a IA respondia ao
  // próprio eco. Como o formato nunca foi confirmado por sonda, qualquer
  // valor fora do esperado cai no lado cauteloso.
  const fromMeIndefinido = !(key.fromMe === false || key.fromMe === "false");
  if (fromMeIndefinido) {
    console.error(
      "[whatsapp/evolution/webhook] mensagem sem key.fromMe — assumindo recebida (chaves):",
      Object.keys(key),
    );
  }

  const remoteJid: string | undefined = key.remoteJid;
  if (!remoteJid) {
    console.error("[whatsapp/evolution/webhook] mensagem sem key.remoteJid — chaves:", Object.keys(key));
    return;
  }
  // Grupo: não tem um "contato" único por trás — fora do escopo desta tarefa.
  if (remoteJid.endsWith("@g.us")) return;

  // `remoteJid` pode vir como LID (identificador opaco, "@lid") em vez de
  // telefone — achado da sonda (não confirmado em produção, defesa mesmo
  // assim). Quando isso acontece o telefone real vem em `remoteJidAlt`.
  const remoteJidAlt: string | undefined = key.remoteJidAlt;
  const phone =
    remoteJid.endsWith("@lid") && remoteJidAlt
      ? remoteJidAlt.split("@")[0]
      : remoteJid.split("@")[0];
  if (!phone) return;

  // Envelopes ANTES de qualquer escrita: desembrulha os transparentes e
  // descarta os que não são mensagem nenhuma. Feito aqui, antes de criar
  // contato/conversa, porque uma reação ou um "apagar para todos" não pode
  // criar contato, incrementar não lidas nem reabrir conversa fechada.
  const msg = desembrulharEnvelope(item?.message ?? {});
  const temConteudoReal = !!(
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    extrairEnvelopeDeMidia(msg)
  );
  if (!temConteudoReal && Object.keys(msg ?? {}).some((k) => ENVELOPES_IGNORADOS.has(k))) {
    return;
  }

  // idempotência: mesma mensagem chega mais de uma vez (reentrega do gateway)
  const { data: dup } = await db
    .from("messages")
    .select("id")
    .eq("wa_message_id", waId)
    .maybeSingle();
  if (dup) return;

  const pushName: string = item?.pushName || phone;
  const nowIso = new Date().toISOString();

  // contato por telefone dentro da empresa
  let { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("location_id", channel.location_id)
    .eq("phone", phone)
    .maybeSingle();
  if (!contact) {
    const parts = pushName.trim().split(/\s+/);
    const first = parts.shift() || phone;
    const { data: created } = await db
      .from("contacts")
      .insert({
        location_id: channel.location_id,
        first_name: first,
        last_name: parts.join(" "),
        phone,
        last_activity_channel: "whatsapp",
        last_activity_at: nowIso,
      })
      .select("id")
      .single();
    contact = created;
  }
  if (!contact) {
    // Mensagem de cliente descartada em silêncio até aqui — sem log, ninguém
    // descobre. Nunca o nome nem o telefone do contato: só a location.
    console.error(
      "[whatsapp/evolution/webhook] contato não criado — mensagem descartada; location:",
      channel.location_id,
    );
    return;
  }

  // Conteúdo: texto, ou mídia (imagem/áudio/vídeo/documento) baixada da
  // Evolution. Classificação SEMPRE pelo envelope (`imageMessage`,
  // `audioMessage`, `videoMessage`, `documentMessage`), NUNCA pelo mime — o
  // documento sondado chegou com `mimetype: image/jpeg` (foto mandada "como
  // documento"); classificar por mime perderia o `fileName`, que só o
  // envelope de documento carrega. `tipoPorMime` é do caminho de ENVIO, não
  // vale aqui.
  let msgType = "text";
  let body: string | undefined;
  const media: {
    media_path?: string;
    media_name?: string;
    media_mime?: string;
    media_size?: number;
  } = {};
  // Duração do áudio (`audioMessage.seconds`), só existe quando o envelope é
  // de áudio. Propagada até `maybeAutoReply` para o teto de transcrição (Task
  // 5) funcionar — sem isso o teto de duração fica inerte e só o tamanho em
  // bytes protege.
  let audioSeconds: number | undefined;

  // Só fica `true` no ramo que extrai texto de verdade (`conversation` /
  // `extendedTextMessage`), antes do fallback `[${tipo}]`. Não dá pra inferir
  // "é texto" a partir de `msgType`: todo caminho de falha de mídia (limite
  // estourado, canal sem instância, erro de download/upload) reescreve
  // `msgType` para `"text"` e preenche `body` com um rótulo de falha — isso
  // NÃO é a fala do cliente e não pode acionar a IA (o webhook da Meta é
  // estrito com `m.text?.body`; este precisa da mesma disciplina).
  let ehTextoReal = false;

  const envelope = extrairEnvelopeDeMidia(msg);
  if (envelope) {
    const { tipo, node } = envelope;
    msgType = tipo;
    body = node.caption ?? "";
    const rotuloFalha = `[${rotuloTipo(tipo)} não disponível]`;

    if (tipo === "audio" && typeof node.seconds === "number") {
      audioSeconds = node.seconds;
    }

    // mime vem com sufixo (ex.: "audio/ogg; codecs=opus") — a extensão sai
    // só da parte antes do ";".
    const mimeDeclarado = String(node.mimetype ?? "").split(";")[0].trim();
    const extDeclarada = (mimeDeclarado.split("/")[1] || "bin").trim();

    // fileLength é objeto protobuf ({low, high, unsigned}), não número —
    // sempre passar por bytesDoPayload.
    const tamanho = bytesDoPayload(node.fileLength);

    if (tamanho !== null && limiteExcedido(tipo, tamanho)) {
      // Estourou o limite: pula o download de propósito — não gasta banda
      // nem Storage com arquivo que seria recusado. Essa checagem prévia é
      // só uma economia (evita download inútil); quem garante de verdade é
      // a re-checagem depois do download, mais abaixo — payload sem
      // `fileLength`, ou num formato que `bytesDoPayload` não reconheça, não
      // pode furar o limite.
      console.error(
        "[whatsapp/evolution/webhook] mídia acima do limite — tipo:",
        tipo,
        "bytes:",
        tamanho,
      );
      if (!body) body = rotuloFalha;
      msgType = "text";
    } else if (!channel.evolution_instance || !channel.evolution_token) {
      console.error(
        "[whatsapp/evolution/webhook] canal sem evolution_instance/evolution_token — tipo:",
        tipo,
      );
      if (!body) body = rotuloFalha;
      msgType = "text";
    } else {
      try {
        const baixado = await baixarMidia(channel.evolution_instance, channel.evolution_token, waId);
        // Re-checagem pelo tamanho REAL dos bytes baixados — a checagem
        // acima só vale quando `fileLength` existe e `bytesDoPayload`
        // reconhece o formato; sem isso qualquer tamanho subiria pro
        // Storage do dono da plataforma, que não tem cota.
        if (limiteExcedido(tipo, baixado.bytes.byteLength)) {
          console.error(
            "[whatsapp/evolution/webhook] mídia acima do limite após download — tipo:",
            tipo,
            "bytes:",
            baixado.bytes.byteLength,
          );
          if (!body) body = rotuloFalha;
          msgType = "text";
        } else {
          const mimeFinal = (baixado.mime || mimeDeclarado).split(";")[0].trim() || "application/octet-stream";
          // Só documentMessage traz fileName de verdade. Quando existir,
          // prioriza a extensão do próprio nome — o mime de documento pode
          // ser gigante (ex.: application/vnd.openxmlformats-officedocument.
          // wordprocessingml.document). Se não der pra extrair do nome, cai
          // no comportamento atual (extensão do mime).
          const extDoNome = tipo === "file" && node.fileName ? extensaoDoNome(node.fileName) : null;
          const extFinal = extDoNome || (mimeFinal.split("/")[1] || extDeclarada || "bin").trim();
          const path = `${channel.location_id}/${contact.id}/${crypto.randomUUID()}.${extFinal}`;
          const { error: upErr } = await db.storage
            .from("conversation-media")
            .upload(path, new Uint8Array(baixado.bytes), { contentType: mimeFinal, upsert: false });
          if (upErr) throw upErr;
          // Só documentMessage traz fileName de verdade; nos outros três,
          // sintetiza tipo + extensão (como o webhook da Meta já faz).
          media.media_path = path;
          media.media_name = tipo === "file" && node.fileName ? node.fileName : `${tipo}.${extFinal}`;
          media.media_mime = mimeFinal;
          media.media_size = baixado.bytes.byteLength;
        }
      } catch (e) {
        // Nunca logar o objeto de erro inteiro — pode ecoar conteúdo, nome de
        // arquivo, token ou URL (é o que faria um erro do Postgres vindo do
        // `upErr` acima, por exemplo). A MENSAGEM, porém, é logada de
        // propósito: quando o erro vem de `baixarMidia` (client.ts), ela foi
        // escrita para carregar só `Object.keys` da resposta do gateway —
        // é o mecanismo para descobrir o nome real do campo do base64, que a
        // sonda não confirmou. Sem isso, um palpite errado faz toda mídia
        // recebida virar "[não disponível]" sem nenhuma linha de log dizendo
        // por quê.
        console.error(
          "[whatsapp/evolution/webhook] falha ao baixar/subir mídia — tipo:",
          tipo,
          "código:",
          (e as any)?.code ?? "desconhecido",
          "mensagem:",
          (e as Error)?.message ?? "desconhecida",
        );
        if (!body) body = rotuloFalha;
        msgType = "text";
      }
    }
  } else {
    body =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      undefined;
    if (body === undefined) {
      // Envelope sem conteúdo interpretável (figurinha, localização, contato,
      // enquete, ...): vira um rótulo pra não perder o registro, mas não é
      // texto real do cliente — `ehTextoReal` fica false, então nunca aciona
      // a IA. Rótulo em PORTUGUÊS: o nome cru do envelope
      // (`[stickerMessage]`) aparecia no inbox e na prévia da conversa do
      // atendente. Envelope realmente desconhecido é logado (só a chave,
      // nunca o conteúdo) para virar rótulo próprio depois.
      const chaves = Object.keys(msg ?? {}).filter((k) => k !== "messageContextInfo");
      const chave = chaves.find((k) => k in ROTULOS_ENVELOPE) ?? chaves[0];
      const rotulo =
        ROTULOS_ENVELOPE[chave] ??
        ROTULOS_ENVELOPE[String(item?.messageType ?? "")] ??
        null;
      if (!rotulo) {
        console.error(
          "[whatsapp/evolution/webhook] envelope não reconhecido — chaves:",
          chaves,
        );
      }
      body = `[${rotulo ?? "mensagem não suportada"}]`;
    } else {
      ehTextoReal = true;
    }
  }

  // conversa de whatsapp desse contato
  let { data: conv } = await db
    .from("conversations")
    .select("id, unread_count")
    .eq("location_id", channel.location_id)
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!conv) {
    const { data: created } = await db
      .from("conversations")
      .insert({
        location_id: channel.location_id,
        contact_id: contact.id,
        channel: "whatsapp",
        channel_id: channel.id,
        unread_count: 1,
        last_message_at: nowIso,
        last_message_preview: body,
      })
      .select("id")
      .single();
    conv = created;
  } else {
    await db
      .from("conversations")
      .update({
        channel_id: channel.id,
        unread_count: (conv.unread_count ?? 0) + 1,
        last_message_at: nowIso,
        last_message_preview: body,
        // O cliente escreveu: a conversa volta pra caixa mesmo que alguém
        // tenha finalizado ou arquivado antes (0029). Perder mensagem de
        // cliente é pior do que desfazer um arquivamento.
        closed_at: null,
        closed_by: null,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", conv.id);
  }
  if (!conv) {
    console.error(
      "[whatsapp/evolution/webhook] conversa não criada — mensagem descartada; location:",
      channel.location_id,
    );
    return;
  }

  const { data: msgInserida, error: insErr } = await db
    .from("messages")
    .insert({
      location_id: channel.location_id,
      conversation_id: conv.id,
      direction: "in",
      type: msgType,
      channel: "whatsapp",
      body,
      channel_id: channel.id,
      wa_message_id: waId,
      status: "delivered",
      ...media,
    })
    .select("created_at")
    .single();
  if (insErr) {
    // corrida: reentrega do gateway — o índice único parcial (0022) barra o
    // 2º insert. Nesse caso NÃO reprocessa.
    if ((insErr as any).code !== "23505") throw insErr;
    return;
  }

  // Auto-responder: texto de verdade OU mídia gravada com sucesso
  // (media_path preenchido — áudio/imagem/vídeo/documento, Tasks 5/6). Mídia
  // cuja gravação FALHOU já foi reescrita para type="text" com um rótulo de
  // erro (`[imagem não disponível]`) pelo bloco acima e cai fora daqui: essa
  // é justamente a razão de existir `ehTextoReal` — sem essa flag, o rótulo
  // de falha seria tratado como fala do cliente e a IA responderia a ele,
  // gastando OPENAI_API_KEY e a chave global do gateway à toa. E nunca aciona
  // a IA quando `fromMe` veio ausente — ver comentário acima, é a proteção
  // contra loop na chave global.
  const ehMidiaGravada = msgType !== "text" && !!media.media_path;
  if ((ehMidiaGravada || (ehTextoReal && !!body)) && !fromMeIndefinido) {
    await maybeAutoReply(db, {
      locationId: channel.location_id,
      conversationId: conv.id,
      contactId: contact.id,
      channelId: channel.id,
      toPhone: phone,
      dailyLimit: channel.daily_limit ?? 1000,
      audioSeconds,
      mensagemEm: msgInserida?.created_at ?? null,
    });
  }
}

/**
 * Envelopes que NÃO são mensagem e não podem gravar nada. Gravar cada um
 * deles como `[nome-do-envelope]` enchia o inbox de lixo, incrementava não
 * lidas, sobrescrevia a prévia da conversa e — o pior — zerava
 * `closed_at`/`archived_at`, reabrindo conversa que o atendente já tinha
 * fechado.
 *
 * - `albumMessage`: só metadados do álbum; as fotos chegam em mensagens
 *   separadas, que são processadas normalmente.
 * - `protocolMessage`: "apagar para todos" e afins — altíssima frequência.
 * - `reactionMessage`: emoji de reação a uma mensagem existente.
 * - `senderKeyDistributionMessage`: chave de grupo, sem conteúdo.
 * - `pollUpdateMessage`: voto em enquete.
 * - `pinInChatMessage` / `keepInChatMessage`: fixar/manter na conversa.
 *
 * A checagem que usa esta lista só descarta quando NÃO há conteúdo real junto
 * (`senderKeyDistributionMessage`, por exemplo, pode acompanhar texto de
 * verdade) — perder mensagem do cliente é pior que gravar um registro a mais.
 */
const ENVELOPES_IGNORADOS = new Set([
  "albumMessage",
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage",
  "pollUpdateMessage",
  "pinInChatMessage",
  "keepInChatMessage",
]);

/**
 * Envelopes que EMBRULHAM conteúdo real e precisam ser abertos antes de
 * qualquer classificação. `ephemeralMessage` é o mais grave: quem usa
 * mensagens temporárias tem TODO o conteúdo embrulhado nele, então texto e
 * mídia desse cliente sumiam (viravam `[ephemeralMessage]`) e a IA nunca
 * disparava para ele.
 */
const ENVELOPES_TRANSPARENTES = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "editedMessage",
];

/**
 * Abre os envelopes transparentes recursivamente (podem vir aninhados, ex.:
 * efêmero contendo visualização única). Profundidade limitada: payload
 * hostil/malformado não pode virar recursão infinita dentro do webhook.
 */
function desembrulharEnvelope(msg: any, profundidade = 0): any {
  if (!msg || typeof msg !== "object" || profundidade >= 5) return msg ?? {};
  for (const nome of ENVELOPES_TRANSPARENTES) {
    const interno = msg[nome]?.message;
    if (interno) return desembrulharEnvelope(interno, profundidade + 1);
  }
  return msg;
}

/**
 * Rótulo em português do que sobra: sem isso o atendente via `[stickerMessage]`
 * no inbox e na prévia da conversa. Continua sendo gravado como mensagem (o
 * comportamento atual), só que legível. Nunca aciona a IA — `ehTextoReal`
 * segue false para todos eles.
 */
const ROTULOS_ENVELOPE: Record<string, string> = {
  stickerMessage: "figurinha",
  locationMessage: "localização",
  liveLocationMessage: "localização em tempo real",
  contactMessage: "contato",
  contactsArrayMessage: "contatos",
  pollCreationMessage: "enquete",
  pollCreationMessageV2: "enquete",
  pollCreationMessageV3: "enquete",
  listMessage: "lista de opções",
  listResponseMessage: "resposta de lista",
  buttonsMessage: "mensagem com botões",
  buttonsResponseMessage: "resposta de botão",
  templateMessage: "mensagem com botões",
  templateButtonReplyMessage: "resposta de botão",
  interactiveMessage: "mensagem interativa",
  interactiveResponseMessage: "resposta interativa",
  ptvMessage: "vídeo",
  eventMessage: "evento",
  orderMessage: "pedido",
  productMessage: "produto",
  paymentInviteMessage: "cobrança",
  requestPaymentMessage: "cobrança",
  groupInviteMessage: "convite de grupo",
  callLogMesssage: "registro de chamada",
  scheduledCallCreationMessage: "chamada agendada",
  secretEncryptedMessage: "mensagem não suportada",
};

/**
 * Reconhece o envelope de mídia dentro de `body.data.message` e devolve o
 * `TipoMidia` interno + o nó com os campos (mimetype, fileLength, fileName
 * quando existir). Classifica SEMPRE pelo envelope, nunca pelo mime — ver
 * comentário em `handleMessage`.
 *
 * `documentWithCaptionMessage` (documento com legenda) não apareceu na
 * sonda; tratado defensivamente aqui, desembrulhando `.message.documentMessage`
 * antes de ler os campos. Envelope não reconhecido (ex.: `secretEncryptedMessage`,
 * visto no gateway) devolve `null` e é ignorado sem quebrar.
 */
function extrairEnvelopeDeMidia(msg: any): { tipo: TipoMidia; node: any } | null {
  if (msg?.documentWithCaptionMessage) {
    const inner = msg.documentWithCaptionMessage?.message?.documentMessage;
    if (inner) return { tipo: "file", node: inner };
  }
  if (msg?.imageMessage) return { tipo: "image", node: msg.imageMessage };
  if (msg?.audioMessage) return { tipo: "audio", node: msg.audioMessage };
  if (msg?.videoMessage) return { tipo: "video", node: msg.videoMessage };
  if (msg?.documentMessage) return { tipo: "file", node: msg.documentMessage };
  return null;
}

/**
 * Extrai a extensão do nome de arquivo de um `documentMessage` (único
 * envelope que traz `fileName` de verdade). Usada para não depender do mime
 * do documento, que pode ser um mime "de aplicativo" longo demais para virar
 * extensão de arquivo (ex.: application/vnd.openxmlformats-officedocument.
 * wordprocessingml.document). Se não der pra extrair (sem ponto, extensão
 * absurda), devolve `null` e quem chama cai no comportamento atual (mime).
 */
function extensaoDoNome(nome: string): string | null {
  const m = /\.([a-zA-Z0-9]{1,10})$/.exec(nome);
  return m ? m[1].toLowerCase() : null;
}

function rotuloTipo(tipo: TipoMidia): string {
  switch (tipo) {
    case "image":
      return "imagem";
    case "audio":
      return "áudio";
    case "video":
      return "vídeo";
    case "file":
      return "documento";
  }
}

async function handleConnectionUpdate(db: any, channel: any, body: any) {
  const newState: string | undefined = body?.data?.state ?? body?.data?.instance?.state;
  if (!newState) {
    console.error(
      "[whatsapp/evolution/webhook] connection_update sem state — chaves:",
      Object.keys(body?.data ?? {}),
    );
    return;
  }

  const patch: Record<string, unknown> = { connection_state: newState };
  if (newState === "open") {
    patch.disconnected_at = null;
  } else if (channel.connection_state === "open") {
    // só carimba no momento em que sai de "open" — reentregas do mesmo
    // estado "close"/"connecting" não empurram o carimbo pra frente.
    patch.disconnected_at = new Date().toISOString();
  }

  await db.from("whatsapp_channels").update(patch).eq("id", channel.id);
}
