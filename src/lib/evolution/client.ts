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
 * Detalhe: no `/instance/create`, o token da instância recém-criada vem no
 * campo `hash` da raiz da resposta (não dentro de `instance`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
 * Cria a instância e já configura o webhook dela (evento `MESSAGES_UPSERT`,
 * único confirmado na sondagem — é o mesmo usado em produção no gateway).
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
  if (!token) throw new Error(`Evolution não devolveu token (hash) ao criar ${nome}`);

  await evo(`/webhook/set/${encodeURIComponent(nome)}`, globalKey(), {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        url: webhookUrl,
        headers: { apikey: webhookSecret },
        enabled: true,
        events: ["MESSAGES_UPSERT"],
        webhookByEvents: false,
        webhookBase64: false,
      },
    }),
  });

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
  const state = await connectionState(nome);
  return { qrBase64: json?.base64 ?? null, state };
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
 * Apaga a instância. Existe SÓ para a compensação da Task 3 (desfazer uma
 * criação que falhou no meio) — não chamar em nenhum outro fluxo.
 */
export async function deleteInstance(nome: string): Promise<void> {
  await evo(`/instance/delete/${encodeURIComponent(nome)}`, globalKey(), {
    method: "DELETE",
  });
}
