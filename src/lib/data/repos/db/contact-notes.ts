"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ContactNote {
  id: string;
  contactId: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
}

const COLUNAS = "id, location_id, contact_id, body, created_by, created_at";

const mapNote = (r: any): ContactNote => ({
  id: r.id,
  contactId: r.contact_id,
  body: r.body,
  createdBy: r.created_by ?? null,
  createdAt: r.created_at,
});

interface ContactNoteState {
  loaded: boolean;
  loading: boolean;
  notes: ContactNote[];
  load: () => Promise<void>;
  patch: (n: ContactNote[]) => void;
}

export const useContactNoteStore = create<ContactNoteState>((set, get) => ({
  loaded: false,
  loading: false,
  notes: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    // Sem location ainda (sessão hidratando): NÃO marca loaded, senão a
    // primeira carga vazia fica em cache pra sempre (armadilha documentada
    // em appointments.ts).
    if (!locationId) {
      set({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contact_notes")
      .select(COLUNAS)
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    if (error) {
      set({ loading: false });
      return;
    }
    set({ loaded: true, loading: false, notes: (data ?? []).map(mapNote) });
  },

  patch: (notes) => set({ notes }),
}));

/** Carrega (uma vez) e retorna as observações do contato — escopadas por
 * `location_id` (multi-tenant) e filtradas por `contactId` na derivação, nunca
 * dentro do selector do Zustand. */
export function useContactNotes(contactId: string) {
  const { notes, loading, loaded, load } = useContactNoteStore();
  useEffect(() => {
    void load();
  }, [load]);

  const contactNotes = useMemo(
    () =>
      notes
        .filter((n) => n.contactId === contactId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes, contactId]
  );

  return { notes: contactNotes, loading: loading || !loaded };
}

export const contactNoteActions = {
  async add(contactId: string, body: string): Promise<boolean> {
    const locationId = useDbStore.getState().locationId;
    if (!locationId) return false;
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        location_id: locationId,
        contact_id: contactId,
        body,
        created_by: auth.user?.id ?? null,
      })
      .select(COLUNAS)
      .single();
    if (error || !data) return false;
    const s = useContactNoteStore.getState();
    s.patch([mapNote(data), ...s.notes]);
    return true;
  },

  async remove(id: string): Promise<boolean> {
    const supabase = createClient();
    // `select()` para detectar recusa da RLS: delete negado não vem com
    // `error`, vem com zero linhas (mesmo padrão de appointments.ts).
    const { data, error } = await supabase
      .from("contact_notes")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data?.length) return false;
    const s = useContactNoteStore.getState();
    s.patch(s.notes.filter((n) => n.id !== id));
    return true;
  },
};
