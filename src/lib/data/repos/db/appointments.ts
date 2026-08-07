"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/lib/data/types";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const mapAppointment = (r: any): Appointment => ({
  id: r.id,
  contactId: r.contact_id,
  title: r.title,
  start: r.starts_at,
  end: r.ends_at,
  calendar: r.calendar,
  source: r.source,
});

interface ApptState {
  loaded: boolean;
  loading: boolean;
  appointments: Appointment[];
  load: () => Promise<void>;
  patch: (a: Appointment[]) => void;
}

export const useApptStore = create<ApptState>((set, get) => ({
  loaded: false,
  loading: false,
  appointments: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const supabase = createClient();
    const { data } = await supabase.from("appointments").select("*").order("starts_at");
    set({ loaded: true, loading: false, appointments: (data ?? []).map(mapAppointment) });
  },

  patch: (appointments) => set({ appointments }),
}));

export function useDbAppointments() {
  const { appointments, loading, loaded, load } = useApptStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { appointments, loading: loading || !loaded };
}

export const appointmentActions = {
  async add(input: {
    title: string;
    contactId: string | null;
    start: string; // ISO
    end: string; // ISO
    calendar?: string;
  }): Promise<boolean> {
    const locationId = useDbStore.getState().locationId;
    if (!locationId) return false;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        location_id: locationId,
        contact_id: input.contactId,
        title: input.title,
        starts_at: input.start,
        ends_at: input.end,
        calendar: input.calendar ?? "Reuniões",
        source: "crm",
      })
      .select()
      .single();
    if (error || !data) return false;
    const s = useApptStore.getState();
    s.patch(
      [...s.appointments, mapAppointment(data)].sort((a, b) => a.start.localeCompare(b.start))
    );
    return true;
  },

  async remove(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return false;
    const s = useApptStore.getState();
    s.patch(s.appointments.filter((a) => a.id !== id));
    return true;
  },
};
