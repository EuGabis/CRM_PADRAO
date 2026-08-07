"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CompanyProfile {
  id: string;
  name: string;
  city: string;
}

export interface MyProfile {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface AccountState {
  loaded: boolean;
  loading: boolean;
  company: CompanyProfile | null;
  profile: MyProfile | null;
  load: () => Promise<void>;
  patch: (p: Partial<Pick<AccountState, "company" | "profile">>) => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  loaded: false,
  loading: false,
  company: null,
  profile: null,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const { locationId, userId } = useDbStore.getState();
    if (!locationId || !userId) {
      set({ loading: false, loaded: true });
      return;
    }
    const supabase = createClient();
    const [{ data: location }, { data: profile }] = await Promise.all([
      supabase.from("locations").select("*").eq("id", locationId).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);
    set({
      loaded: true,
      loading: false,
      company: location
        ? { id: location.id, name: location.name, city: location.city ?? "" }
        : null,
      profile: profile
        ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            color: profile.color,
          }
        : null,
    });
  },

  patch: (p) => set(p),
}));

export function useAccount() {
  const store = useAccountStore();
  useEffect(() => {
    void store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return store;
}

export const accountActions = {
  /** Só administradores conseguem (a RLS reforça). */
  async updateCompany(patch: { name?: string; city?: string }): Promise<{ ok: boolean; error?: string }> {
    const { company } = useAccountStore.getState();
    if (!company) return { ok: false, error: "Empresa não encontrada" };
    const supabase = createClient();
    const { data, error } = await supabase
      .from("locations")
      .update({ name: patch.name, city: patch.city })
      .eq("id", company.id)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: "Não foi possível salvar" };
    if (!data) return { ok: false, error: "Apenas administradores podem editar a empresa" };
    useAccountStore.getState().patch({
      company: { id: data.id, name: data.name, city: data.city ?? "" },
    });
    return { ok: true };
  },

  async updateProfile(patch: { name?: string }): Promise<{ ok: boolean; error?: string }> {
    const { profile } = useAccountStore.getState();
    if (!profile) return { ok: false, error: "Perfil não encontrado" };
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ name: patch.name })
      .eq("id", profile.id)
      .select()
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Não foi possível salvar" };
    useAccountStore.getState().patch({
      profile: { id: data.id, name: data.name, email: data.email, color: data.color },
    });
    return { ok: true };
  },
};
