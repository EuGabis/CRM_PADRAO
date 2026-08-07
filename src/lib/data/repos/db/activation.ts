"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ActivationStep {
  key: string;
  completedAt: string;
  completedBy: string | null;
}

interface ActivationState {
  loaded: boolean;
  loading: boolean;
  steps: ActivationStep[];
  load: () => Promise<void>;
  patch: (steps: ActivationStep[]) => void;
}

export const useActivationStore = create<ActivationState>((set, get) => ({
  loaded: false,
  loading: false,
  steps: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    if (!locationId) {
      set({ loading: false, loaded: true });
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("activation_steps")
      .select("*")
      .eq("location_id", locationId);
    set({
      loaded: true,
      loading: false,
      steps: (data ?? []).map((r: any) => ({
        key: r.step_key,
        completedAt: r.completed_at,
        completedBy: r.completed_by,
      })),
    });
  },

  patch: (steps) => set({ steps }),
}));

export function useActivation() {
  const store = useActivationStore();
  useEffect(() => {
    void store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return store;
}

export const activationActions = {
  async complete(stepKey: string): Promise<boolean> {
    const { locationId, userId } = useDbStore.getState();
    if (!locationId) return false;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("activation_steps")
      .insert({ location_id: locationId, step_key: stepKey, completed_by: userId })
      .select()
      .single();
    if (error || !data) return false;
    const s = useActivationStore.getState();
    s.patch([
      ...s.steps.filter((x) => x.key !== stepKey),
      { key: stepKey, completedAt: data.completed_at, completedBy: data.completed_by },
    ]);
    return true;
  },

  async undo(stepKey: string): Promise<boolean> {
    const locationId = useDbStore.getState().locationId;
    if (!locationId) return false;
    const supabase = createClient();
    const { error } = await supabase
      .from("activation_steps")
      .delete()
      .eq("location_id", locationId)
      .eq("step_key", stepKey);
    if (error) return false;
    const s = useActivationStore.getState();
    s.patch(s.steps.filter((x) => x.key !== stepKey));
    return true;
  },
};
