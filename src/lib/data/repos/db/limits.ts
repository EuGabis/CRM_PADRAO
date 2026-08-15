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
  retries: number;
  load: (force?: boolean) => Promise<void>;
}

export const useLimitsStore = create<LimitsState>((set, get) => ({
  limits: SEM_LIMITE,
  loaded: false,
  loading: false,
  retries: 0,
  async load(force = false) {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    // Sem location resolvida ainda: NÃO marca loaded, senão cacheia vazio
    // para sempre. Mesma corrida que já mordeu em db/whatsapp.ts — o
    // useDbStore.load() acima pode voltar na hora (guard `loaded || loading`)
    // porque outro store já disparou o load no mesmo tick. Quem refaz é o
    // useEffect dos hooks abaixo, que observa o locationId.
    if (!locationId) {
      set({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("location_limits")
      .select("max_users, max_whatsapp_channels, disabled_modules")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) {
      // Falha de leitura (RLS, rede, tabela ausente) NÃO pode virar "esta
      // empresa não tem limite": marcar loaded aqui liberaria os módulos pagos
      // para sempre. Deixa não-carregado e agenda retry limitado — o locationId
      // já está resolvido, então o useEffect não refaz sozinho.
      set({ loading: false });
      if (get().retries < 5) {
        set({ retries: get().retries + 1 });
        setTimeout(() => void get().load(), 1000);
      }
      return;
    }
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
      retries: 0,
    });
  },
}));

/** Limites da empresa do usuário logado. */
export function useLimits() {
  const { limits, loaded, load } = useLimitsStore();
  // Refaz o load quando o locationId aparecer (mesmo padrão de db/whatsapp.ts):
  // na primeira passada ele costuma ser null por causa da corrida com os
  // outros stores, e com deps [] o limite nunca carregaria.
  const locationId = useDbStore((s) => s.locationId);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);
  return { loaded, ...limits };
}
