"use client";

import { create } from "zustand";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

export interface Limits {
  maxUsers: number | null;
  maxWhatsappChannels: number | null;
  disabledModules: string[];
}

const SEM_LIMITE: Limits = {
  maxUsers: null,
  maxWhatsappChannels: null,
  disabledModules: [],
};

interface LimitsState {
  limits: Limits;
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
}

export const useLimitsStore = create<LimitsState>((set, get) => ({
  limits: SEM_LIMITE,
  loaded: false,
  loading: false,
  async load(force = false) {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    // Sem location resolvida ainda: NÃO marca loaded, senão cacheia vazio
    // para sempre. Mesma corrida que já mordeu em db/whatsapp.ts.
    if (!locationId) {
      set({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("location_limits")
      .select("max_users, max_whatsapp_channels, disabled_modules")
      .eq("location_id", locationId)
      .maybeSingle();
    set({
      limits: data
        ? {
            maxUsers: data.max_users ?? null,
            maxWhatsappChannels: data.max_whatsapp_channels ?? null,
            disabledModules: data.disabled_modules ?? [],
          }
        : SEM_LIMITE,
      loaded: true,
      loading: false,
    });
  },
}));

/** Limites da empresa do usuário logado. */
export function useLimits() {
  const { limits, loaded, load } = useLimitsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { loaded, ...limits };
}
