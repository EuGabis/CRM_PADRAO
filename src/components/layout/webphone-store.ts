"use client";

import { create } from "zustand";

/**
 * O webphone vive num popover da topbar, mas quem manda ligar está espalhado
 * pelo app (card do kanban, cabeçalho da conversa). Estado global porque o
 * gatilho e o painel não têm relação de pai/filho.
 */
interface WebphoneState {
  open: boolean;
  number: string;
  /** Nome de quem está sendo chamado, quando a ligação partiu de um contato. */
  target: string | null;
  setOpen: (open: boolean) => void;
  setNumber: (number: string) => void;
  press: (key: string) => void;
  backspace: () => void;
  /** Abre o webphone já com o número do contato no visor. */
  callContact: (phone: string, name?: string) => void;
}

export const useWebphone = create<WebphoneState>((set) => ({
  open: false,
  number: "",
  target: null,
  setOpen: (open) => set({ open }),
  setNumber: (number) => set({ number }),
  press: (key) => set((s) => ({ number: s.number + key })),
  backspace: () => set((s) => ({ number: s.number.slice(0, -1) })),
  callContact: (phone, name) =>
    set({ open: true, number: formatDigits(phone), target: name ?? null }),
}));

/** Mantém só dígitos e o + inicial — o visor do teclado é numérico. */
function formatDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}
