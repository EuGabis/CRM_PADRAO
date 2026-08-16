"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";

export interface EmpresaPlataforma {
  id: string;
  nome: string;
  criadaEm: string;
  suspensaEm: string | null;
  motivoSuspensao: string | null;
  maxUsers: number | null;
  maxChannels: number | null;
  disabledModules: string[];
  whatsappProvider: "meta" | "evolution";
  usuarios: number;
  contatos: number;
  canais: number;
  canaisAtivos: number;
}

export interface CriarEmpresaInput {
  nome: string;
  email: string;
  senha: string;
  maxUsers: number | null;
  maxChannels: number | null;
  disabledModules: string[];
  provider: "meta" | "evolution";
}

export interface SalvarLimitesInput {
  maxUsers: number | null;
  maxChannels: number | null;
  disabledModules: string[];
  whatsappProvider: "meta" | "evolution";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapEmpresa(location: any, stats: any): EmpresaPlataforma {
  const limits = location.location_limits ?? null;
  return {
    id: location.id,
    nome: location.name,
    criadaEm: location.created_at,
    suspensaEm: location.suspended_at ?? null,
    motivoSuspensao: location.suspended_reason ?? null,
    maxUsers: limits?.max_users ?? null,
    maxChannels: limits?.max_whatsapp_channels ?? null,
    disabledModules: limits?.disabled_modules ?? [],
    whatsappProvider: (limits?.whatsapp_provider ?? "meta") as "meta" | "evolution",
    usuarios: stats?.usuarios ?? 0,
    contatos: stats?.contatos ?? 0,
    canais: stats?.canais ?? 0,
    canaisAtivos: stats?.canais_ativos ?? 0,
  };
}

interface PlataformaState {
  empresas: EmpresaPlataforma[];
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
}

export const usePlataformaStore = create<PlataformaState>((set, get) => ({
  empresas: [],
  loaded: false,
  loading: false,

  load: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    const supabase = createClient();
    const [{ data: locations, error: locError }, { data: stats, error: statsError }] =
      await Promise.all([
        supabase
          .from("locations")
          .select("id, name, created_at, suspended_at, suspended_reason, location_limits(*)")
          .order("created_at", { ascending: false }),
        supabase.rpc("platform_stats"),
      ]);

    if (locError || statsError) {
      set({ loading: false });
      return;
    }

    const statsByLocation = new Map((stats ?? []).map((s: any) => [s.location_id, s]));
    const empresas = (locations ?? []).map((l: any) =>
      mapEmpresa(l, statsByLocation.get(l.id))
    );

    set({ empresas, loaded: true, loading: false });
  },
}));

/** Empresas clientes cadastradas na plataforma, com contadores de uso. */
export function useEmpresas() {
  const { empresas, loaded, loading, load } = usePlataformaStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { empresas, loaded, loading };
}

async function reload() {
  await usePlataformaStore.getState().load(true);
}

export const plataformaActions = {
  /** Cria empresa + convite + usuário + limites via rota server-side. */
  async criarEmpresa(
    input: CriarEmpresaInput
  ): Promise<{ ok: boolean; email?: string; error?: string; warning?: string }> {
    try {
      const res = await fetch("/api/plataforma/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: input.nome,
          email: input.email,
          senha: input.senha,
          maxUsers: input.maxUsers,
          maxChannels: input.maxChannels,
          disabledModules: input.disabledModules,
          provider: input.provider,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        return { ok: false, error: payload.error ?? "Não foi possível criar a empresa" };
      }
      await reload();
      return { ok: true, email: payload.email, warning: payload.warning };
    } catch {
      return { ok: false, error: "Falha de conexão ao criar a empresa" };
    }
  },

  async suspender(locationId: string, motivo: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const { error } = await supabase
      .from("locations")
      .update({ suspended_at: new Date().toISOString(), suspended_reason: motivo })
      .eq("id", locationId);
    if (error) return { ok: false, error: "Não foi possível suspender a empresa" };
    await reload();
    return { ok: true };
  },

  async reativar(locationId: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const { error } = await supabase
      .from("locations")
      .update({ suspended_at: null, suspended_reason: null })
      .eq("id", locationId);
    if (error) return { ok: false, error: "Não foi possível reativar a empresa" };
    await reload();
    return { ok: true };
  },

  async salvarLimites(
    locationId: string,
    input: SalvarLimitesInput
  ): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const { error } = await supabase
      .from("location_limits")
      .update({
        max_users: input.maxUsers,
        max_whatsapp_channels: input.maxChannels,
        disabled_modules: input.disabledModules,
        whatsapp_provider: input.whatsappProvider,
        updated_at: new Date().toISOString(),
      })
      .eq("location_id", locationId);
    if (error) return { ok: false, error: "Não foi possível salvar os limites" };
    await reload();
    return { ok: true };
  },
};
