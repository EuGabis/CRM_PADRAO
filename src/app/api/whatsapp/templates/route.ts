import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/whatsapp/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/** Lista os templates aprovados da WABA do canal. Autenticada. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const channelId = new URL(request.url).searchParams.get("channelId");
  if (!channelId) return Response.json({ error: "channelId ausente" }, { status: 400 });

  const { data: channel } = await supabase
    .from("whatsapp_channels")
    .select("waba_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel?.waba_id) return Response.json({ error: "Canal sem WABA" }, { status: 404 });

  try {
    const templates = await listTemplates(channel.waba_id);
    return Response.json({ templates });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao listar templates" },
      { status: 502 },
    );
  }
}
