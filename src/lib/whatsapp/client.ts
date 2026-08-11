/**
 * Cliente da Meta Cloud API (Graph). SERVER-ONLY: usa WHATSAPP_TOKEN, que
 * nunca pode ir pro cliente. Todas as rotas /api/whatsapp/* passam por aqui.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

function token(): string {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("WHATSAPP_TOKEN ausente no servidor");
  return t;
}

async function graph(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Graph API ${res.status}`);
  }
  return json;
}

export function sendText(phoneNumberId: string, to: string, body: string) {
  return graph(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
  });
}

export function sendTemplate(
  phoneNumberId: string,
  to: string,
  name: string,
  lang: string,
  components?: unknown[],
) {
  return graph(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: lang },
        ...(components && components.length ? { components } : {}),
      },
    }),
  });
}

export async function listTemplates(wabaId: string) {
  const json = await graph(`${wabaId}/message_templates?status=APPROVED&limit=100`, {
    method: "GET",
  });
  return (json.data ?? []) as Array<{
    name: string;
    language: string;
    status: string;
    category: string;
    components: unknown[];
  }>;
}

export function getNumberInfo(phoneNumberId: string) {
  return graph(
    `${phoneNumberId}?fields=verified_name,quality_rating,display_phone_number,code_verification_status`,
    { method: "GET" },
  );
}

export function markRead(phoneNumberId: string, messageId: string) {
  return graph(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}
