"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { autenticarRealtime, statusRealtime } from "@/lib/supabase/realtime";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WhatsappChannel {
  id: string;
  name: string;
  metaName: string;
  phoneE164: string;
  phoneNumberId: string;
  wabaId: string;
  sector: string;
  dailyLimit: number;
  active: boolean;
  createdAt: string;
  provider: "meta" | "evolution";
  connectionState: string;
  disconnectedAt: string | null;
}

function mapRow(r: any): WhatsappChannel {
  return {
    id: r.id,
    name: r.name,
    metaName: r.meta_name ?? "",
    phoneE164: r.phone_e164 ?? "",
    phoneNumberId: r.phone_number_id,
    wabaId: r.waba_id ?? "",
    sector: r.sector ?? "",
    dailyLimit: r.daily_limit ?? 1000,
    active: r.active,
    createdAt: r.created_at,
    provider: (r.provider ?? "meta") as "meta" | "evolution",
    connectionState: r.connection_state ?? "disconnected",
    disconnectedAt: r.disconnected_at ?? null,
  };
}

interface ChannelsState {
  loaded: boolean;
  loading: boolean;
  retries: number;
  channels: WhatsappChannel[];
  load: (force?: boolean) => Promise<void>;
  set: (channels: WhatsappChannel[]) => void;
  patch: (id: string, patch: Partial<WhatsappChannel>) => void;
}

const useChannelsStore = create<ChannelsState>((setState, get) => ({
  loaded: false,
  loading: false,
  retries: 0,
  channels: [],
  set: (channels) => setState({ channels }),
  patch: (id, patch) =>
    setState({ channels: get().channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
  load: async (force = false) => {
    // `force` ignora o cache (`loaded`), nunca o guard de `loading` — senão um
    // refresh durante um load em voo dispara query concorrente e duas
    // reconciliações do Evolution em paralelo.
    if (get().loading) return;
    if (!force && get().loaded) return;
    setState({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    if (!locationId) {
      // Empresa ainda não disponível — NÃO marca loaded (senão prende "nenhum canal"
      // vazio pra sempre). O hook refaz quando o locationId aparecer.
      setState({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("whatsapp_channels")
      .select(
        "id, name, meta_name, phone_e164, phone_number_id, waba_id, sector, daily_limit, active, created_at, provider, connection_state, disconnected_at",
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    if (error) {
      // Erro transitório na query (locationId já ok) — não cacheia vazio. O hook não
      // refaz sozinho aqui (locationId não muda), então agenda retry bounded.
      setState({ loading: false });
      if (get().retries < 5) {
        setState({ retries: get().retries + 1 });
        setTimeout(() => void get().load(), 1000);
      }
      return;
    }
    const channels = (data ?? []).map(mapRow);
    setState({ loaded: true, loading: false, channels, retries: 0 });
    void reconciliarEvolution(channels);
  },
}));

/**
 * O webhook (`CONNECTION_UPDATE`) pode se perder — sem essa checagem, um
 * canal caído continua marcado como conectado até a próxima entrega de
 * sorte. Roda em segundo plano (não bloqueia `loaded`), uma consulta por
 * canal Evolution, e só grava no store o que realmente divergir.
 */
async function reconciliarEvolution(channels: WhatsappChannel[]) {
  const evolutionChannels = channels.filter((c) => c.provider === "evolution");
  for (const c of evolutionChannels) {
    try {
      const res = await fetch("/api/whatsapp/evolution/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: c.id }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.state && (json.state !== c.connectionState || json.disconnectedAt !== c.disconnectedAt)) {
        useChannelsStore.getState().patch(c.id, {
          connectionState: json.state,
          disconnectedAt: json.disconnectedAt ?? null,
        });
      }
    } catch {
      // Reconciliação é best-effort — falha de rede não pode travar a tela.
    }
  }
}

export function useWhatsappChannels() {
  const { channels, loaded, loading, load } = useChannelsStore();
  // Refaz o load quando a empresa (locationId) ficar disponível — evita cachear
  // "nenhum canal" quando a sessão ainda não estava pronta no primeiro render.
  const locationId = useDbStore((s) => s.locationId);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);
  return { channels, ready: loaded && !loading };
}

export const whatsappActions = {
  async createChannel(input: {
    name: string;
    sector: string;
    phoneE164: string;
    phoneNumberId: string;
    wabaId: string;
    dailyLimit: number;
  }): Promise<{ ok: boolean; error?: string }> {
    const locationId = useDbStore.getState().locationId;
    if (!locationId) return { ok: false, error: "Empresa não encontrada" };
    const supabase = createClient();
    const { data, error } = await supabase
      .from("whatsapp_channels")
      .insert({
        location_id: locationId,
        name: input.name,
        sector: input.sector,
        phone_e164: input.phoneE164,
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        daily_limit: input.dailyLimit,
      })
      .select()
      .single();
    if (error || !data) {
      const msg = error?.message?.includes("duplicate")
        ? "Já existe um canal com esse phone_number_id"
        : error?.message ?? "Não foi possível criar o canal";
      return { ok: false, error: msg };
    }
    const s = useChannelsStore.getState();
    s.set([mapRow(data), ...s.channels]);
    return { ok: true };
  },

  /** Recarrega a lista de canais ignorando o cache (`loaded`). */
  refresh(): void {
    void useChannelsStore.getState().load(true);
  },

  /**
   * Chama `POST /api/whatsapp/evolution/excluir`: apaga a instância no
   * gateway e o canal no banco. A rota é quem valida dono e prefixo — aqui
   * só mandamos o id.
   */
  async excluirEvolution(channelId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/whatsapp/evolution/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json?.error ?? "Não foi possível excluir" };
      const s = useChannelsStore.getState();
      s.set(s.channels.filter((c) => c.id !== channelId));
      return { ok: true };
    } catch {
      return { ok: false, error: "Falha de conexão ao excluir" };
    }
  },

  /**
   * Chama `POST /api/whatsapp/evolution/conectar`. Sem `channelId` cria um
   * canal novo; com `channelId` reconecta o existente (mesma instância).
   */
  async conectarEvolution(input: {
    channelId?: string;
    nome?: string;
  }): Promise<
    | { ok: true; channelId: string; instancia: string; qrBase64: string | null; state: string }
    | { ok: false; error: string }
  > {
    try {
      const res = await fetch("/api/whatsapp/evolution/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          input.channelId ? { channelId: input.channelId } : { nome: input.nome },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json?.error ?? "Não foi possível conectar" };
      return {
        ok: true,
        channelId: json.channelId,
        instancia: json.instancia,
        qrBase64: json.qrBase64 ?? null,
        state: json.state ?? "connecting",
      };
    } catch {
      return { ok: false, error: "Falha de conexão ao gerar o QR" };
    }
  },

  async toggleActive(id: string, active: boolean): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("whatsapp_channels").update({ active }).eq("id", id);
    if (error) return false;
    const s = useChannelsStore.getState();
    s.set(s.channels.map((c) => (c.id === id ? { ...c, active } : c)));
    return true;
  },

  async send(args: {
    conversationId: string;
    channelId?: string;
    text?: string;
    template?: { name: string; language: string; components?: unknown[] };
  }): Promise<{ ok: boolean; needsTemplate?: boolean; error?: string; message?: any }> {
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, needsTemplate: json?.needsTemplate, error: json?.error };
    }
    return { ok: true, message: json.message };
  },

  async sendMedia(args: {
    conversationId: string;
    channelId?: string;
    messageId: string;
    mediaPath: string;
    mime?: string;
    kind: "image" | "audio" | "video";
    caption?: string;
  }): Promise<{ ok: boolean; needsTemplate?: boolean; error?: string }> {
    const res = await fetch("/api/whatsapp/send-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, needsTemplate: json?.needsTemplate, error: json?.error };
    return { ok: true };
  },

  async templates(channelId: string): Promise<
    Array<{ name: string; language: string; category: string; components: unknown[] }>
  > {
    const res = await fetch(`/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}`);
    const json = await res.json().catch(() => ({}));
    return res.ok ? json.templates ?? [] : [];
  },

  async listAllTemplates(channelId: string) {
    const res = await fetch(
      `/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}&all=1`,
    );
    const json = await res.json().catch(() => ({}));
    return res.ok ? json.templates ?? [] : [];
  },

  async createTemplate(
    channelId: string,
    input: { name: string; category: string; language: string; bodyText: string; examples: string[] },
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch("/api/whatsapp/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, ...input }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json?.error };
  },

  async deleteTemplate(channelId: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(
      `/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}&name=${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json?.error };
  },
};

export interface TemplateLog {
  id: string;
  contactName: string;
  templateName: string;
  status: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorDetail: string | null;
}

function mapLog(r: any): TemplateLog {
  const c = r.conversations?.contacts ?? {};
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return {
    id: r.id,
    contactName: name || "—",
    templateName: r.template_name,
    status: r.status ?? null,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at ?? null,
    readAt: r.read_at ?? null,
    failedAt: r.failed_at ?? null,
    errorDetail: r.error_detail ?? null,
  };
}

export function useTemplateLogs(channelId: string | null) {
  const [logs, setLogs] = useState<TemplateLog[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!channelId) {
      setLogs([]);
      setReady(true);
      return;
    }
    const supabase = createClient();
    let active = true;

    const query = () =>
      supabase
        .from("messages")
        .select("id, template_name, status, created_at, delivered_at, read_at, failed_at, error_detail, conversations(contacts(first_name, last_name))")
        .eq("channel_id", channelId)
        .not("template_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

    setReady(false);
    void query().then(({ data }) => {
      if (!active) return;
      setLogs((data ?? []).map(mapLog));
      setReady(true);
    });

    // Sem o setAuth o socket entra anônimo e a RLS zera os eventos — mesmo
    // motivo da inbox. Aqui não dá pra `await` (estamos num useEffect), então
    // o subscribe só acontece depois que o token foi aplicado.
    const channel = supabase
      .channel(`tmpl-logs-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        () => {
          void query().then(({ data }) => {
            if (active) setLogs((data ?? []).map(mapLog));
          });
        },
      );

    void autenticarRealtime(supabase).then(() => {
      if (active) channel.subscribe(statusRealtime(`tmpl-logs-${channelId}`, () => {}));
    });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return { logs, ready };
}
