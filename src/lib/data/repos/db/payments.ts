"use client";

import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GuruCredential {
  connected: boolean;
  apiKey: string;
  webhookToken: string;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  historyBackfillCursor: string | null;
  historyBackfillDone: boolean;
}

export interface PaymentEvent {
  id: string;
  provider: string;
  externalId: string | null;
  code: string | null;
  eventType: string | null;
  status: string | null;
  amount: number | null;
  currency: string;
  contactName: string | null;
  contactEmail: string | null;
  productName: string | null;
  raw: Record<string, unknown>;
  receivedAt: string;
  guruCreatedAt: string | null;
  guruUpdatedAt: string | null;
}

export interface PaymentSubscription {
  id: string;
  provider: string;
  externalId: string;
  code: string | null;
  status: string | null;
  amount: number | null;
  currency: string;
  contactName: string | null;
  contactEmail: string | null;
  productName: string | null;
  raw: Record<string, unknown>;
  updatedAt: string;
  guruStartedAt: string | null;
  guruUpdatedAt: string | null;
  chargedTimes: number | null;
  chargedEveryDays: number | null;
  nextCycleAt: string | null;
}

const EMPTY_GURU: GuruCredential = {
  connected: false,
  apiKey: "",
  webhookToken: "",
  connectedAt: null,
  lastSyncedAt: null,
  historyBackfillCursor: null,
  historyBackfillDone: false,
};

function mapGuruCredential(row: any): GuruCredential {
  return {
    connected: true,
    apiKey: row.api_key ?? "",
    webhookToken: row.webhook_token,
    connectedAt: row.created_at,
    lastSyncedAt: row.last_synced_at ?? null,
    historyBackfillCursor: row.history_backfill_cursor ?? null,
    historyBackfillDone: row.history_backfill_done ?? false,
  };
}

function mapPaymentEvent(row: any): PaymentEvent {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    code: row.code ?? null,
    eventType: row.event_type,
    status: row.status,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    currency: row.currency ?? "BRL",
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    productName: row.product_name,
    raw: row.raw ?? {},
    receivedAt: row.received_at,
    guruCreatedAt: row.guru_created_at ?? null,
    guruUpdatedAt: row.guru_updated_at ?? null,
  };
}

function mapPaymentSubscription(row: any): PaymentSubscription {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    code: row.code ?? null,
    status: row.status,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    currency: row.currency ?? "BRL",
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    productName: row.product_name,
    raw: row.raw ?? {},
    updatedAt: row.updated_at,
    guruStartedAt: row.guru_started_at ?? null,
    guruUpdatedAt: row.guru_updated_at ?? null,
    chargedTimes: row.charged_times ?? null,
    chargedEveryDays: row.charged_every_days ?? null,
    nextCycleAt: row.next_cycle_at ?? null,
  };
}

const MAX_EVENTS = 100;

interface PaymentsState {
  loaded: boolean;
  loading: boolean;
  realtime: "off" | "on";
  guru: GuruCredential;
  events: PaymentEvent[];
  subscriptions: PaymentSubscription[];
  load: () => Promise<void>;
  patch: (
    p: Partial<Pick<PaymentsState, "guru" | "events" | "subscriptions" | "realtime">>
  ) => void;
}

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  loaded: false,
  loading: false,
  realtime: "off",
  guru: EMPTY_GURU,
  events: [],
  subscriptions: [],

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
    const [{ data: credential }, { data: events }, { data: subscriptions }] = await Promise.all([
      supabase
        .from("payment_credentials")
        .select("*")
        .eq("location_id", locationId)
        .eq("provider", "guru")
        .maybeSingle(),
      supabase
        .from("payment_events")
        .select("*")
        .eq("location_id", locationId)
        // guru_created_at é a data real da venda; received_at é só quando o
        // nosso banco viu a linha (irrelevante para dados trazidos por sync).
        .order("guru_created_at", { ascending: false, nullsFirst: false })
        .limit(MAX_EVENTS),
      supabase
        .from("payment_subscriptions")
        .select("*")
        .eq("location_id", locationId)
        .order("guru_updated_at", { ascending: false, nullsFirst: false }),
    ]);

    set({
      loaded: true,
      loading: false,
      guru: credential ? mapGuruCredential(credential) : EMPTY_GURU,
      events: (events ?? []).map(mapPaymentEvent),
      subscriptions: (subscriptions ?? []).map(mapPaymentSubscription),
    });

    // Um INSERT/UPDATE em tempo real isolado não dá pra encaixar direto no
    // array em memória sem arriscar furar a ordenação ou (pior) evictar uma
    // linha legítima do topo quando o evento é de uma venda antiga fora da
    // janela carregada (ex.: o sync ainda preenchendo o backfill histórico
    // grava/atualiza vendas de 2024 o tempo todo). Em vez de emendar o
    // array, qualquer evento só dispara um refetch (debounced) das mesmas
    // consultas do load() — a lista em tela sempre reflete a ordenação real
    // do banco, nunca "esvazia" nem embaralha.
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        const [{ data: freshEvents }, { data: freshSubs }] = await Promise.all([
          supabase
            .from("payment_events")
            .select("*")
            .eq("location_id", locationId)
            .order("guru_created_at", { ascending: false, nullsFirst: false })
            .limit(MAX_EVENTS),
          supabase
            .from("payment_subscriptions")
            .select("*")
            .eq("location_id", locationId)
            .order("guru_updated_at", { ascending: false, nullsFirst: false }),
        ]);
        set({
          events: (freshEvents ?? []).map(mapPaymentEvent),
          subscriptions: (freshSubs ?? []).map(mapPaymentSubscription),
        });
      }, 800);
    };

    supabase
      .channel("lito-pagamentos")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_events" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_subscriptions" }, refetch)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") set({ realtime: "on" });
      });
  },

  patch: (p) => set(p),
}));

export function useGuruIntegration() {
  const { guru, loaded, load } = usePaymentsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { guru, loaded };
}

export function usePaymentEvents() {
  const { events, load } = usePaymentsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => events, [events]);
}

export function usePaymentSubscriptions() {
  const { subscriptions, load } = usePaymentsStore();
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(() => subscriptions, [subscriptions]);
}

export function usePaymentsRealtimeStatus() {
  return usePaymentsStore((s) => s.realtime);
}

export interface SalesMonthlyRow {
  month: string;
  productName: string;
  status: string | null;
  salesCount: number;
  revenue: number;
}

function mapSalesMonthlyRow(r: any): SalesMonthlyRow {
  return {
    month: r.month,
    productName: r.product_name,
    status: r.status ?? null,
    salesCount: Number(r.sales_count ?? 0),
    revenue: Number(r.revenue ?? 0),
  };
}

/**
 * Vendas agregadas por mês x produto x status, direto de `payment_sales_monthly`
 * (migração 0020) — cobre TODO o histórico, não só as 100 vendas mais
 * recentes carregadas por `usePaymentEvents`. Usado nos KPIs/gráficos de
 * Vendas e Relatórios, que precisam bater com os números reais da Guru.
 */
export function usePaymentSalesReport() {
  const [rows, setRows] = useState<SalesMonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      await useDbStore.getState().load();
      const loc = useDbStore.getState().locationId;
      if (!loc) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.from("payment_sales_monthly").select("*").eq("location_id", loc);
      if (!active) return;
      setRows((data ?? []).map(mapSalesMonthlyRow));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { rows, loading };
}

const locationId = () => useDbStore.getState().locationId;

export const paymentsActions = {
  /** Só administradores conseguem (a RLS reforça). */
  async saveGuruCredentials(input: {
    apiKey: string;
    webhookToken: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const loc = locationId();
    const userId = useDbStore.getState().userId;
    if (!loc) return { ok: false, error: "Empresa não encontrada" };
    const webhookToken = input.webhookToken.trim();
    if (!webhookToken) return { ok: false, error: "Informe o token do webhook" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("payment_credentials")
      .upsert(
        {
          location_id: loc,
          provider: "guru",
          api_key: input.apiKey.trim() || null,
          webhook_token: webhookToken,
          connected_by: userId,
        },
        { onConflict: "location_id,provider" }
      )
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "23505" && error.message.includes("webhook_token")) {
        return {
          ok: false,
          error: "Esse token já está em uso por outra empresa — gere um novo no painel da Guru",
        };
      }
      // 42501 = RLS bloqueou (política "admins criam/editam credenciais")
      if (error.code === "42501") {
        return { ok: false, error: "Apenas administradores podem configurar integrações de pagamento" };
      }
      // 42P01 = tabela ainda não existe (migração 0008 não aplicada)
      if (error.code === "42P01") {
        return { ok: false, error: "Migração do banco ainda não aplicada (payment_credentials não existe)" };
      }
      return { ok: false, error: `Não foi possível salvar: ${error.message}` };
    }
    if (!data) {
      return { ok: false, error: "Apenas administradores podem configurar integrações de pagamento" };
    }

    // Confere se o que voltou do banco é o que enviamos — evita um "sucesso" falso
    // se algo (RLS, trigger, etc.) silenciosamente descartar algum campo.
    const sentApiKey = input.apiKey.trim() || null;
    if (data.api_key !== sentApiKey) {
      return {
        ok: false,
        error: "A chave de API não foi salva corretamente — tente novamente",
      };
    }

    usePaymentsStore.getState().patch({ guru: mapGuruCredential(data) });
    return { ok: true };
  },

  async disconnectGuru(): Promise<boolean> {
    const loc = locationId();
    if (!loc) return false;
    const supabase = createClient();
    const { error } = await supabase
      .from("payment_credentials")
      .delete()
      .eq("location_id", loc)
      .eq("provider", "guru");
    if (error) return false;
    usePaymentsStore.getState().patch({ guru: EMPTY_GURU });
    return true;
  },
};
