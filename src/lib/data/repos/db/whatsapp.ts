"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
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
  };
}

interface ChannelsState {
  loaded: boolean;
  loading: boolean;
  channels: WhatsappChannel[];
  load: () => Promise<void>;
  set: (channels: WhatsappChannel[]) => void;
}

const useChannelsStore = create<ChannelsState>((setState, get) => ({
  loaded: false,
  loading: false,
  channels: [],
  set: (channels) => setState({ channels }),
  load: async () => {
    if (get().loaded || get().loading) return;
    setState({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    if (!locationId) {
      setState({ loading: false, loaded: true });
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("whatsapp_channels")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    setState({ loaded: true, loading: false, channels: (data ?? []).map(mapRow) });
  },
}));

export function useWhatsappChannels() {
  const { channels, loaded, loading, load } = useChannelsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  }): Promise<{ ok: boolean; needsTemplate?: boolean; error?: string }> {
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, needsTemplate: json?.needsTemplate, error: json?.error };
    }
    return { ok: true };
  },

  async templates(channelId: string): Promise<
    Array<{ name: string; language: string; category: string; components: unknown[] }>
  > {
    const res = await fetch(`/api/whatsapp/templates?channelId=${encodeURIComponent(channelId)}`);
    const json = await res.json().catch(() => ({}));
    return res.ok ? json.templates ?? [] : [];
  },
};
