/**
 * Cliente da Evolution API (gateway próprio de WhatsApp não oficial, Baileys).
 * SERVER-ONLY: usa EVOLUTION_API_URL e EVOLUTION_API_KEY, que nunca podem ir
 * pro cliente.
 *
 * ⚠️ A EVOLUTION_API_KEY é a chave GLOBAL do gateway: com ela dá pra criar,
 * ler e apagar QUALQUER instância — inclusive de outros projetos que rodem
 * no mesmo gateway. Ela só é usada aqui em `instance/*` e `webhook/*`.
 * `sendText` é a exceção: usa o TOKEN DA INSTÂNCIA (parâmetro `token`), não
 * a chave global — vazamento do token afeta um cliente só; da chave global,
 * o gateway inteiro.
 *
 * Rotas confirmadas por sondagem real numa instância descartável (v2.3.7),
 * já que a documentação pública estava fora do ar e a v1 usava caminhos
 * diferentes:
 *   - POST   /instance/create               body { instanceName, integration, qrcode }
 *   - GET    /instance/connect/{nome}        QR em { code, base64, pairingCode, count } (NÃO
 *                                            aninhado em "qrcode" — só a resposta do /create
 *                                            aninha; a do /connect é plana)
 *   - GET    /instance/connectionState/{nome} -> { instance: { instanceName, state } }
 *   - POST   /message/sendText/{nome}        body { number, text }, apikey = token da instância
 *   - POST   /webhook/set/{nome}             body { webhook: { url, headers, enabled, events, ... } }
 *   - GET    /webhook/find/{nome}
 *   - DELETE /instance/delete/{nome}
 *   - GET    /instance/fetchInstances
 *   - POST   /message/sendMedia/{nome}       body { number, mediatype, media, fileName?,
 *                                            caption?, mimetype? }, apikey = token da instância.
 *                                            mediatype é enum: image | document | video | audio.
 *                                            media aceita URL ou base64.
 *   - POST   /message/sendWhatsAppAudio/{nome} body { number, audio }, apikey = token da
 *                                            instância. audio aceita URL ou base64.
 *   - POST   /chat/getBase64FromMediaMessage/{nome} body { message: { key: { id } } },
 *                                            apikey = token da instância.
 * Detalhe: no `/instance/create`, o token da instância recém-criada vem no
 * campo `hash` da raiz da resposta (não dentro de `instance`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TipoMidia } from "@/lib/whatsapp/media-limits";

function baseUrl(): string {
  const u = process.env.EVOLUTION_API_URL;
  if (!u) throw new Error("EVOLUTION_API_URL ausente no servidor");
  return u.replace(/\/+$/, "");
}

function globalKey(): string {
  const k = process.env.EVOLUTION_API_KEY;
  if (!k) throw new Error("EVOLUTION_API_KEY ausente no servidor");
  return k;
}

/**
 * Formata o erro da Evolution com o máximo de contexto: status HTTP e o
 * corpo cru (o gateway ora devolve `{message}`, ora `{error, response}`,
 * ora um array de mensagens).
 */
function evoError(status: number, json: any, where: string): Error {
  const msg =
    json?.response?.message ??
    json?.message ??
    json?.error ??
    "erro desconhecido";
  const detail = Array.isArray(msg) ? msg.join("; ") : String(msg);
  return new Error(`${detail} · HTTP ${status} · em ${where}`);
}

async function evo(path: string, apikey: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      apikey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw evoError(res.status, json, path);
  }
  return json;
}

/**
 * Cria a instância e já configura o webhook dela (eventos `MESSAGES_UPSERT`
 * e `CONNECTION_UPDATE` — o primeiro confirmado na sondagem, o segundo
 * necessário pro webhook detectar queda de conexão e carimbar
 * `disconnected_at`; sem ele nunca chega evento de mudança de estado).
 * `webhookSecret` vai no header `apikey` que a Evolution envia de volta nas
 * chamadas do webhook — é o CRM quem valida esse header ao receber.
 * Devolve o token da instância (campo `hash` da resposta do /instance/create).
 */
export async function createInstance(
  nome: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<{ token: string }> {
  const created = await evo("/instance/create", globalKey(), {
    method: "POST",
    body: JSON.stringify({
      instanceName: nome,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
  const token = created?.hash;
  if (!token) {
    // A instância já existe no gateway mesmo sem o `hash` — o /instance/create
    // respondeu 200. Sem limpar aqui, ela fica órfã em silêncio (mesmo risco
    // do webhook falho logo abaixo).
    try {
      await deleteInstance(nome);
    } catch (deleteErr) {
      throw new Error(
        `Evolution não devolveu token (hash) ao criar "${nome}" e a limpeza automática ` +
          `também falhou (${(deleteErr as Error).message}). A instância "${nome}" ficou ` +
          `órfã no gateway — apague manualmente.`,
      );
    }
    throw new Error(
      `Evolution não devolveu token (hash) ao criar "${nome}". A instância foi desfeita automaticamente.`,
    );
  }

  // A limpeza fica AQUI, não no chamador: se o /webhook/set falhar, o
  // chamador nunca chegou a receber o token nem soube que a instância foi
  // criada — ele não tem com o que compensar. Sem isso a instância fica
  // órfã no gateway (sem webhook, nome ocupado), e como o gateway é
  // compartilhado com outro projeto do dono, lixo ali é problema real.
  try {
    await evo(`/webhook/set/${encodeURIComponent(nome)}`, globalKey(), {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          headers: { apikey: webhookSecret },
          enabled: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          webhookByEvents: false,
          webhookBase64: false,
        },
      }),
    });
  } catch (webhookErr) {
    try {
      await deleteInstance(nome);
    } catch (deleteErr) {
      // Não afirme que foi limpo sem ter confirmado: o dono precisa saber
      // exatamente o que restou para apagar à mão no gateway.
      throw new Error(
        `Falha ao configurar webhook de "${nome}" (${(webhookErr as Error).message}) ` +
          `e a limpeza automática também falhou (${(deleteErr as Error).message}). ` +
          `A instância "${nome}" ficou órfã no gateway — apague manualmente.`,
      );
    }
    throw new Error(
      `Falha ao configurar webhook de "${nome}": ${(webhookErr as Error).message}. ` +
        `A instância foi desfeita automaticamente.`,
    );
  }

  return { token };
}

/**
 * Pede o QR atual da instância. A resposta do /instance/connect é plana
 * (não aninhada em "qrcode" como a do /instance/create) — o base64 vem
 * direto em `base64`. O state real vem de uma segunda chamada
 * (connectionState), porque o /connect não devolve `state`.
 */
export async function connectInstance(
  nome: string,
): Promise<{ qrBase64: string | null; state: string }> {
  const json = await evo(`/instance/connect/${encodeURIComponent(nome)}`, globalKey(), {
    method: "GET",
  });
  // json?.qrcode?.base64 é fallback defensivo: a rota sondada (v2.3.7) devolve
  // o base64 plano (json.base64), mas o /instance/create aninha em "qrcode" —
  // um upgrade do gateway pode um dia uniformizar os dois formatos.
  const qrBase64 = json?.base64 ?? json?.qrcode?.base64 ?? null;

  let state = "connecting";
  try {
    state = await connectionState(nome);
  } catch {
    // Não perder o QR que já temos em mãos por causa de uma segunda chamada
    // que falhou — "connecting" é um fallback razoável logo após pedir o QR.
  }

  return { qrBase64, state };
}

/** Devolve o estado da conexão: "open" | "close" | "connecting" etc. */
export async function connectionState(nome: string): Promise<string> {
  const json = await evo(`/instance/connectionState/${encodeURIComponent(nome)}`, globalKey(), {
    method: "GET",
  });
  return json?.instance?.state ?? "close";
}

/**
 * Envia texto usando o TOKEN DA INSTÂNCIA, não a chave global — ver aviso
 * no topo do arquivo.
 */
export async function sendText(
  nome: string,
  token: string,
  paraE164: string,
  texto: string,
): Promise<{ id: string }> {
  const json = await evo(`/message/sendText/${encodeURIComponent(nome)}`, token, {
    method: "POST",
    body: JSON.stringify({ number: paraE164, text: texto }),
  });
  return { id: json?.key?.id ?? "" };
}

/**
 * Mapa de `TipoMidia` (nosso vocabulário interno, usado também em
 * `media-limits.ts`) para o enum `mediatype` do `/message/sendMedia`
 * confirmado na sondagem: `image | document | video | audio`. Só diverge em
 * "file" -> "document" — o resto é 1:1.
 */
function mediatypeDoTipo(tipo: TipoMidia): "image" | "document" | "video" | "audio" {
  return tipo === "file" ? "document" : tipo;
}

/**
 * Envia imagem, vídeo, documento ou áudio (como anexo, não voz) usando o
 * TOKEN DA INSTÂNCIA, não a chave global — ver aviso no topo do arquivo.
 * `url` pode ser uma URL pública/assinada ou uma string base64 — o gateway
 * aceita os dois (confirmado no sonda.md pelo erro
 * "Owned media must be a url or base64").
 */
export async function sendMedia(
  nome: string,
  token: string,
  paraE164: string,
  tipo: TipoMidia,
  url: string,
  nomeArquivo?: string,
  legenda?: string,
): Promise<{ id: string }> {
  const json = await evo(`/message/sendMedia/${encodeURIComponent(nome)}`, token, {
    method: "POST",
    body: JSON.stringify({
      number: paraE164,
      mediatype: mediatypeDoTipo(tipo),
      media: url,
      ...(nomeArquivo ? { fileName: nomeArquivo } : {}),
      ...(legenda ? { caption: legenda } : {}),
    }),
  });
  // Mesma suposição já feita em sendText: o id da mensagem vem em
  // `key.id`. Não confirmado especificamente para sendMedia na sondagem
  // (só o schema do corpo foi sondado, não o da resposta) — se o formato
  // da resposta divergir do sendText, isso devolve "" em vez de quebrar,
  // mas o CRM perde o id pra rastrear a mensagem enviada.
  return { id: json?.key?.id ?? "" };
}

/**
 * Envia áudio como MENSAGEM DE VOZ (ptt) usando o TOKEN DA INSTÂNCIA.
 * `url` aceita URL ou base64 (confirmado no sonda.md).
 *
 * NÃO CONFIRMADO: se o gateway converte sozinho o webm/opus que o navegador
 * grava. Se não converter, o áudio pode chegar mudo ou nem chegar no
 * WhatsApp — precisa ser confirmado no primeiro envio real (ver sonda.md).
 * Se isso quebrar, o desenho muda: precisaria converter pra ogg/opus antes
 * de mandar pra cá.
 */
export async function sendWhatsAppAudio(
  nome: string,
  token: string,
  paraE164: string,
  url: string,
): Promise<{ id: string }> {
  const json = await evo(`/message/sendWhatsAppAudio/${encodeURIComponent(nome)}`, token, {
    method: "POST",
    body: JSON.stringify({ number: paraE164, audio: url }),
  });
  // Mesma suposição do sendText/sendMedia sobre `key.id` — não confirmado
  // especificamente para esta rota.
  return { id: json?.key?.id ?? "" };
}

/**
 * Baixa uma mídia recebida a partir do id da mensagem no WhatsApp (`wa_message_id`),
 * usando o TOKEN DA INSTÂNCIA. O formato do CORPO da requisição foi confirmado
 * na sondagem (`{ message: { key: { id } } }`), mas o formato da RESPOSTA não —
 * não havia mídia real recebida para inspecionar (ver sonda.md).
 *
 * NÃO CONFIRMADO: os nomes dos campos da resposta onde vêm o base64 e o mime.
 * As chaves abaixo (`base64`, `mimetype`/`mimeType`) são um palpite baseado em
 * convenções comuns da Evolution API, NÃO confirmado por sondagem real. Se o
 * gateway usar nomes diferentes, `json?.base64` vem `undefined`, `atob`
 * recebe string vazia e o `ArrayBuffer` resultante fica vazio — a mídia
 * "baixa" sem erro, mas o arquivo salvo fica corrompido/vazio. Precisa ser
 * confirmado com uma mídia real recebida antes de confiar nesta função em
 * produção (Task 4 depende disso).
 */
export async function baixarMidia(
  nome: string,
  token: string,
  chave: string,
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const json = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(nome)}`, token, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: chave } } }),
  });
  const base64: string = json?.base64 ?? "";
  const mime: string = json?.mimetype ?? json?.mimeType ?? "";
  const binario = Buffer.from(base64, "base64");
  const bytes = binario.buffer.slice(
    binario.byteOffset,
    binario.byteOffset + binario.byteLength,
  ) as ArrayBuffer;
  return { bytes, mime };
}

/**
 * Apaga a instância. Existe SÓ para a compensação da Task 3 (desfazer uma
 * criação que falhou no meio) — não chamar em nenhum outro fluxo.
 */
export async function deleteInstance(nome: string): Promise<void> {
  await evo(`/instance/delete/${encodeURIComponent(nome)}`, globalKey(), {
    method: "DELETE",
  });
}
