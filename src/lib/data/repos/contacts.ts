"use client";

import { useCrmStore } from "../store";
import type { Contact } from "../types";

export function useContacts() {
  return useCrmStore((s) => s.contacts);
}

export function useContact(id: string | null) {
  return useCrmStore((s) => (id ? s.contacts.find((c) => c.id === id) ?? null : null));
}

export function useUsers() {
  return useCrmStore((s) => s.users);
}

export function contactName(c: Pick<Contact, "firstName" | "lastName">) {
  return `${c.firstName} ${c.lastName}`;
}

export const contactActions = {
  add: (c: Parameters<ReturnType<typeof useCrmStore.getState>["addContact"]>[0]) =>
    useCrmStore.getState().addContact(c),
  update: (id: string, patch: Partial<Contact>) => useCrmStore.getState().updateContact(id, patch),
  addTag: (ids: string[], tag: string) => useCrmStore.getState().addTagToContacts(ids, tag),
  removeTag: (ids: string[], tag: string) => useCrmStore.getState().removeTagFromContacts(ids, tag),
  remove: (ids: string[]) => useCrmStore.getState().deleteContacts(ids),
};
