"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/lib/data/types";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const mapAppointment = (r: any): Appointment => ({
  id: r.id,
  contactId: r.contact_id,
  // Coluna da 0041; `?? null` cobre o intervalo entre subir o código e
  // aplicar a migração.
  opportunityId: r.opportunity_id ?? null,
  reminderMinutes: r.reminder_minutes ?? null,
  ownerId: r.owner_id ?? null,
  title: r.title,
  start: r.starts_at,
  end: r.ends_at,
  calendar: r.calendar,
  source: r.source,
  // Coluna da 0063; `??` cobre o intervalo entre subir o código e aplicar a
  // migração.
  kind: r.kind ?? "compromisso",
  done: r.done ?? false,
});

interface ApptState {
  loaded: boolean;
  loading: boolean;
  appointments: Appointment[];
  load: () => Promise<void>;
  /** Recarrega ignorando o cache — usado pelo motor de lembretes. */
  reload: () => Promise<void>;
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

  reload: async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("appointments").select("*").order("starts_at");
    if (error) return; // falha de rede não pode zerar a agenda na tela
    set({ appointments: (data ?? []).map(mapAppointment) });
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

/**
 * Recorte de visualização por agenda — compartilhado entre WeekCalendar e
 * MonthCalendar para não duplicar a regra em dois lugares. `ownerFilter`
 * indefinido ou `"__all__"` é "tudo"; `"__shared__"` é o compromisso sem dono
 * (agenda da empresa); qualquer outro valor é o id do dono. A RLS já limita o
 * que chega do banco — isto é só recorte de tela, não permissão. Rode SEMPRE
 * dentro de um `useMemo` no componente chamador — nunca dentro de um selector
 * do Zustand (ver AGENTS.md item 4).
 */
export function filterByOwner(appointments: Appointment[], ownerFilter?: string): Appointment[] {
  if (!ownerFilter || ownerFilter === "__all__") return appointments;
  if (ownerFilter === "__shared__") return appointments.filter((a) => !a.ownerId);
  return appointments.filter((a) => a.ownerId === ownerFilter);
}

/**
 * Compromissos/tarefas de UM contato, filtrados por `kind`. O filtro roda
 * dentro do `useMemo`, nunca no selector do Zustand — filtrar/mapear no
 * selector cria array novo a cada render e trava a tela (bug recorrente
 * neste projeto, ver AGENTS.md item 4).
 */
export function useContactAppointments(
  contactId: string,
  kind: "compromisso" | "tarefa"
) {
  const { appointments, loading, loaded, load } = useApptStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = useMemo(
    () =>
      appointments
        .filter((a) => a.contactId === contactId && a.kind === kind)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [appointments, contactId, kind]
  );
  return { appointments: filtered, loading: loading || !loaded };
}

export const appointmentActions = {
  async add(input: {
    title: string;
    contactId: string | null;
    opportunityId?: string | null;
    reminderMinutes?: number | null;
    /** Ausente = o compromisso nasce de quem está criando. */
    ownerId?: string | null;
    start: string; // ISO
    end: string; // ISO
    calendar?: string;
    /** Ausente = compromisso, mesmo default da coluna (0063). */
    kind?: "compromisso" | "tarefa";
  }): Promise<boolean> {
    const locationId = useDbStore.getState().locationId;
    if (!locationId) return false;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        location_id: locationId,
        contact_id: input.contactId,
        opportunity_id: input.opportunityId ?? null,
        reminder_minutes: input.reminderMinutes ?? null,
        // Sem dono explícito, o compromisso é de quem criou — é o que faz a
        // agenda ser "a minha" por padrão (0043).
        owner_id: input.ownerId !== undefined ? input.ownerId : useDbStore.getState().userId,
        title: input.title,
        starts_at: input.start,
        ends_at: input.end,
        calendar: input.calendar ?? "Reuniões",
        kind: input.kind ?? "compromisso",
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

  /** Edição pelo diálogo do calendário (título, vínculos, horário). */
  async update(
    id: string,
    input: {
      title?: string;
      contactId?: string | null;
      opportunityId?: string | null;
      reminderMinutes?: number | null;
      ownerId?: string | null;
      start?: string;
      end?: string;
      calendar?: string;
    }
  ): Promise<boolean> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.contactId !== undefined) patch.contact_id = input.contactId;
    if (input.opportunityId !== undefined) patch.opportunity_id = input.opportunityId;
    if (input.reminderMinutes !== undefined) patch.reminder_minutes = input.reminderMinutes;
    if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
    if (input.start !== undefined) patch.starts_at = input.start;
    if (input.end !== undefined) patch.ends_at = input.end;
    if (input.calendar !== undefined) patch.calendar = input.calendar;
    if (Object.keys(patch).length === 0) return true;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error || !data) return false;
    const s = useApptStore.getState();
    s.patch(
      s.appointments
        .map((a) => (a.id === id ? mapAppointment(data) : a))
        .sort((a, b) => a.start.localeCompare(b.start))
    );
    return true;
  },

  /**
   * Arrastar na grade: muda o início e mantém a DURAÇÃO. Recalcular o fim a
   * partir do novo início evita o caso de uma reunião de 2h virar 45min só
   * porque foi movida de dia.
   *
   * Otimista: a grade já mostra o evento no lugar novo antes da resposta, e
   * volta sozinha se o banco recusar.
   */
  async move(id: string, newStart: string): Promise<boolean> {
    const s = useApptStore.getState();
    const current = s.appointments.find((a) => a.id === id);
    if (!current) return false;
    const duration = new Date(current.end).getTime() - new Date(current.start).getTime();
    const end = new Date(new Date(newStart).getTime() + duration).toISOString();

    const previous = s.appointments;
    s.patch(
      s.appointments
        .map((a) => (a.id === id ? { ...a, start: newStart, end } : a))
        .sort((a, b) => a.start.localeCompare(b.start))
    );

    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .update({ starts_at: newStart, ends_at: end })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error || !data) {
      useApptStore.getState().patch(previous);
      return false;
    }
    return true;
  },

  /** Marca/desmarca uma tarefa como concluída — nunca apaga o registro. */
  async toggleDone(id: string, done: boolean): Promise<boolean> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .update({ done })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error || !data) return false;
    const s = useApptStore.getState();
    s.patch(s.appointments.map((a) => (a.id === id ? mapAppointment(data) : a)));
    return true;
  },

  async remove(id: string): Promise<boolean> {
    const supabase = createClient();
    // `select()` para detectar recusa da RLS: um delete negado não vem com
    // `error`, vem com zero linhas — sem isso a tela diria "excluído" com o
    // compromisso ainda no banco (0043 restringiu por dono).
    const { data, error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length) return false;
    const s = useApptStore.getState();
    s.patch(s.appointments.filter((a) => a.id !== id));
    return true;
  },
};
