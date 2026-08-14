import { createClient } from "@/lib/supabase/server";
import { listTemplates, createTemplate, deleteTemplate } from "@/lib/whatsapp/client";
import { validateTemplateInput, type TemplateCategory } from "@/lib/whatsapp/templates";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/** Resolve a WABA do canal respeitando a RLS (membership do usuário logado). */
async function wabaOf(supabase: any, channelId: string): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_channels")
    .select("waba_id")
    .eq("id", channelId)
    .maybeSingle();
  return data?.waba_id || null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const all = url.searchParams.get("all") === "1";
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    const templates = await listTemplates(wabaId, { all });
    return Response.json({ templates });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao listar templates" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: "payload inválido" }, { status: 400 }); }
  const { channelId, name, category, language, bodyText, examples } = body ?? {};
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const input = {
    name: String(name ?? "").trim(),
    category: category as TemplateCategory,
    language: String(language ?? "pt_BR").trim(),
    bodyText: String(bodyText ?? ""),
    examples: Array.isArray(examples) ? examples.map((e: unknown) => String(e ?? "")) : [],
  };
  const check = validateTemplateInput(input);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    const created = await createTemplate(wabaId, input);
    return Response.json({ ok: true, id: created.id, status: created.status });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao criar template" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const name = url.searchParams.get("name");
  if (!channelId || !name) return Response.json({ error: "channelId e name obrigatórios" }, { status: 400 });

  const wabaId = await wabaOf(supabase, channelId);
  if (!wabaId) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    await deleteTemplate(wabaId, name);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao excluir template" },
      { status: 502 },
    );
  }
}
