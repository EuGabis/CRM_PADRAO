"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONTACT_FILES_BUCKET = "contact-files";

/** Mesmo teto do bucket (`file_size_limit`, migração 0063) — recusa antes de
 * subir, não deixa o Storage recusar depois de já ter gasto banda. */
const TETO_BYTES = 20 * 1024 * 1024;

export interface ContactFile {
  id: string;
  contactId: string;
  storagePath: string;
  fileName: string;
  fileMime: string | null;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
}

const COLUNAS =
  "id, location_id, contact_id, storage_path, file_name, file_mime, file_size, uploaded_by, created_at";

const mapFile = (r: any): ContactFile => ({
  id: r.id,
  contactId: r.contact_id,
  storagePath: r.storage_path,
  fileName: r.file_name,
  fileMime: r.file_mime ?? null,
  fileSize: r.file_size,
  uploadedBy: r.uploaded_by ?? null,
  createdAt: r.created_at,
});

const loc = () => useDbStore.getState().locationId;

interface ContactFileState {
  loaded: boolean;
  loading: boolean;
  files: ContactFile[];
  load: () => Promise<void>;
  patch: (f: ContactFile[]) => void;
}

export const useContactFileStore = create<ContactFileState>((set, get) => ({
  loaded: false,
  loading: false,
  files: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    // Sem location ainda (sessão hidratando): NÃO marca loaded, senão a
    // primeira carga vazia fica em cache pra sempre (armadilha documentada
    // em appointments.ts / contact-notes.ts).
    if (!locationId) {
      set({ loading: false });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contact_files")
      .select(COLUNAS)
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    if (error) {
      set({ loading: false });
      return;
    }
    set({ loaded: true, loading: false, files: (data ?? []).map(mapFile) });
  },

  patch: (files) => set({ files }),
}));

/** Carrega (uma vez) e retorna os arquivos do contato — escopados por
 * `location_id` (multi-tenant) e filtrados por `contactId` na derivação,
 * nunca dentro do selector do Zustand. */
export function useContactFiles(contactId: string) {
  const { files, loading, loaded, load } = useContactFileStore();
  useEffect(() => {
    void load();
  }, [load]);

  const contactFiles = useMemo(
    () =>
      files
        .filter((f) => f.contactId === contactId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [files, contactId]
  );

  return { files: contactFiles, loading: loading || !loaded };
}

export const contactFileActions = {
  /**
   * Sobe o binário para o bucket `contact-files` e só então grava a linha em
   * `contact_files`. Se a gravação falhar, remove o binário — mesmo cuidado
   * de "não deixa órfão" do `sendMedia` em conversations.ts.
   */
  async upload(
    contactId: string,
    file: File
  ): Promise<{ ok: boolean; error?: string }> {
    const locationId = loc();
    if (!locationId) return { ok: false, error: "Empresa não encontrada" };

    if (file.size > TETO_BYTES) {
      return {
        ok: false,
        error: `Arquivo maior que o limite de ${Math.round(TETO_BYTES / (1024 * 1024))} MB.`,
      };
    }

    const supabase = createClient();
    const ext =
      (file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1]) || "bin";
    // Primeiro segmento TEM que ser o location_id — é o que a policy do
    // bucket usa pra isolar tenant (mesmo padrão de conversation-media).
    const path = `${locationId}/${contactId}/${crypto.randomUUID()}.${ext.toLowerCase()}`;

    const { error: upErr } = await supabase.storage
      .from(CONTACT_FILES_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) return { ok: false, error: `Falha no upload: ${upErr.message}` };

    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("contact_files")
      .insert({
        location_id: locationId,
        contact_id: contactId,
        storage_path: path,
        file_name: file.name,
        file_mime: file.type || null,
        file_size: file.size,
        uploaded_by: auth.user?.id ?? null,
      })
      .select(COLUNAS)
      .single();

    if (error || !data) {
      await supabase.storage.from(CONTACT_FILES_BUCKET).remove([path]); // não deixa binário órfão
      return { ok: false, error: error?.message ?? "Não foi possível salvar o arquivo" };
    }

    const s = useContactFileStore.getState();
    if (!s.files.some((f) => f.id === data.id)) {
      s.patch([mapFile(data), ...s.files]);
    }
    return { ok: true };
  },

  /**
   * Apaga a linha e o binário. Se um dos dois falhar, tenta o outro mesmo
   * assim e relata o que sobrou — não deixa estado inconsistente em
   * silêncio.
   */
  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const s = useContactFileStore.getState();
    const file = s.files.find((f) => f.id === id);
    if (!file) return { ok: false, error: "Arquivo não encontrado" };

    // `select()` para detectar recusa da RLS: delete negado não vem com
    // `error`, vem com zero linhas (mesmo padrão de appointments.ts /
    // contact-notes.ts).
    const { data, error } = await supabase
      .from("contact_files")
      .delete()
      .eq("id", id)
      .select("id");
    const rowRemoved = !error && !!data?.length;

    const { error: storageError } = await supabase.storage
      .from(CONTACT_FILES_BUCKET)
      .remove([file.storagePath]);
    const binaryRemoved = !storageError;

    if (rowRemoved) {
      s.patch(s.files.filter((f) => f.id !== id));
    }

    if (rowRemoved && binaryRemoved) return { ok: true };
    if (rowRemoved && !binaryRemoved) {
      return { ok: false, error: "Registro apagado, mas o arquivo continua no armazenamento." };
    }
    if (!rowRemoved && binaryRemoved) {
      return { ok: false, error: "Arquivo removido do armazenamento, mas o registro não pôde ser apagado." };
    }
    return { ok: false, error: "Não foi possível apagar o arquivo." };
  },

  /** URL assinada de curta duração (bucket é privado). Nunca logar o retorno. */
  async signedUrl(storagePath: string, expiresIn = 300): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from(CONTACT_FILES_BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    return data?.signedUrl ?? null;
  },
};
