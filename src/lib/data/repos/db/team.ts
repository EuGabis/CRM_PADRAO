"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MemberRole = "admin" | "user";

/** Permissões por módulo: chave = slug da rota. Ausente/true = liberado. */
export type ModulePermissions = Record<string, boolean>;

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: MemberRole;
  onlyAssigned: boolean;
  permissions: ModulePermissions;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  onlyAssigned: boolean;
  permissions: ModulePermissions;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

const mapInvite = (r: any): Invitation => ({
  id: r.id,
  email: r.email,
  role: r.role,
  onlyAssigned: r.only_assigned,
  permissions: r.permissions ?? {},
  status: r.status,
  createdAt: r.created_at,
});

interface TeamState {
  loaded: boolean;
  loading: boolean;
  members: TeamMember[];
  invitations: Invitation[];
  load: (force?: boolean) => Promise<void>;
  patch: (p: Partial<Pick<TeamState, "members" | "invitations">>) => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  loaded: false,
  loading: false,
  members: [],
  invitations: [],

  load: async (force = false) => {
    if ((get().loaded && !force) || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const locationId = useDbStore.getState().locationId;
    if (!locationId) {
      set({ loading: false, loaded: true });
      return;
    }
    const supabase = createClient();
    const [memberships, profiles, invites] = await Promise.all([
      supabase.from("location_members").select("*").eq("location_id", locationId),
      supabase.from("profiles").select("*"),
      supabase
        .from("invitations")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
    ]);

    const profileById = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));
    const members: TeamMember[] = (memberships.data ?? []).map((m: any) => {
      const p = profileById.get(m.user_id);
      return {
        userId: m.user_id,
        name: p?.name ?? "Usuário",
        email: p?.email ?? "",
        color: p?.color ?? "#6366f1",
        role: m.role,
        onlyAssigned: m.only_assigned,
        permissions: m.permissions ?? {},
        createdAt: m.created_at,
      };
    });

    set({
      loaded: true,
      loading: false,
      members: members.sort((a, b) => a.name.localeCompare(b.name)),
      invitations: (invites.data ?? []).map(mapInvite),
    });
  },

  patch: (p) => set(p),
}));

export function useTeam() {
  const store = useTeamStore();
  useEffect(() => {
    void store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return store;
}

/** Membership do usuário logado (papel e permissões efetivas). */
export function useMyMembership() {
  const { members, loaded, load } = useTeamStore();
  const userId = useDbStore((s) => s.userId);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => {
    const me = members.find((m) => m.userId === userId) ?? null;
    return {
      loaded,
      me,
      isAdmin: me?.role === "admin",
      /** Admin vê tudo; usuário vê o que não estiver explicitamente desligado. */
      can: (moduleKey: string) => (me?.role === "admin" ? true : me?.permissions?.[moduleKey] !== false),
    };
  }, [members, userId, loaded]);
}

const locationId = () => useDbStore.getState().locationId;

async function reload() {
  await useTeamStore.getState().load(true);
}

export const teamActions = {
  async invite(input: {
    email: string;
    role: MemberRole;
    onlyAssigned: boolean;
    permissions: ModulePermissions;
  }): Promise<{ ok: boolean; error?: string }> {
    const loc = locationId();
    if (!loc) return { ok: false, error: "Empresa não encontrada" };
    const email = input.email.trim().toLowerCase();
    const state = useTeamStore.getState();
    if (state.members.some((m) => m.email.toLowerCase() === email)) {
      return { ok: false, error: "Esta pessoa já faz parte da equipe" };
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        location_id: loc,
        email,
        role: input.role,
        only_assigned: input.onlyAssigned,
        permissions: input.permissions,
        created_by: useDbStore.getState().userId,
      })
      .select()
      .single();
    if (error || !data) {
      return {
        ok: false,
        error:
          error?.code === "23505"
            ? "Já existe um convite pendente para este e-mail"
            : error?.code === "42P01"
              ? "Aplique a migração 0004 no Supabase para habilitar convites"
              : "Não foi possível criar o convite",
      };
    }
    state.patch({ invitations: [mapInvite(data), ...state.invitations] });
    return { ok: true };
  },

  async revokeInvite(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return false;
    const s = useTeamStore.getState();
    s.patch({
      invitations: s.invitations.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)),
    });
    return true;
  },

  async deleteInvite(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) return false;
    const s = useTeamStore.getState();
    s.patch({ invitations: s.invitations.filter((i) => i.id !== id) });
    return true;
  },

  async updateMember(
    userId: string,
    patch: { role?: MemberRole; onlyAssigned?: boolean; permissions?: ModulePermissions }
  ): Promise<{ ok: boolean; error?: string }> {
    const loc = locationId();
    if (!loc) return { ok: false, error: "Empresa não encontrada" };
    const row: Record<string, unknown> = {};
    if (patch.role !== undefined) row.role = patch.role;
    if (patch.onlyAssigned !== undefined) row.only_assigned = patch.onlyAssigned;
    if (patch.permissions !== undefined) row.permissions = patch.permissions;

    const supabase = createClient();
    const { error } = await supabase
      .from("location_members")
      .update(row)
      .eq("location_id", loc)
      .eq("user_id", userId);
    if (error) {
      // O banco protege o último administrador
      return {
        ok: false,
        error: error.message.includes("pelo menos um administrador")
          ? "A empresa precisa de pelo menos um administrador"
          : "Não foi possível salvar as alterações",
      };
    }
    const s = useTeamStore.getState();
    s.patch({
      members: s.members.map((m) =>
        m.userId === userId
          ? {
              ...m,
              role: patch.role ?? m.role,
              onlyAssigned: patch.onlyAssigned ?? m.onlyAssigned,
              permissions: patch.permissions ?? m.permissions,
            }
          : m
      ),
    });
    return { ok: true };
  },

  async removeMember(userId: string): Promise<{ ok: boolean; error?: string }> {
    const loc = locationId();
    if (!loc) return { ok: false, error: "Empresa não encontrada" };
    if (userId === useDbStore.getState().userId) {
      return { ok: false, error: "Você não pode remover a si mesmo" };
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("location_members")
      .delete()
      .eq("location_id", loc)
      .eq("user_id", userId);
    if (error) {
      return {
        ok: false,
        error: error.message.includes("pelo menos um administrador")
          ? "A empresa precisa de pelo menos um administrador"
          : "Não foi possível remover o usuário",
      };
    }
    const s = useTeamStore.getState();
    s.patch({ members: s.members.filter((m) => m.userId !== userId) });
    return { ok: true };
  },

  reload,
};
