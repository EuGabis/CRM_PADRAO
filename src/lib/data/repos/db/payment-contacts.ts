"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Contatos da Guru = compradores/assinantes agregados no banco pelas views
 * `payment_contacts` / `payment_contacts_summary` (migração 0016). Diferente
 * das outras abas, NÃO deriva do store em memória (que carrega só as 100
 * vendas mais recentes) — aqui paginamos direto no Postgres pra cobrir todo o
 * histórico, como o painel da Guru.
 */

export const CONTACTS_PAGE_SIZE = 20;

export interface GuruContact {
  contactKey: string;
  name: string | null;
  email: string | null;
  purchases: number;
  totalSpent: number;
  activeSubs: number;
  lastActivity: string | null;
}

export interface GuruContactsSummary {
  contacts: number;
  revenue: number;
  withSubs: number;
}

function mapRow(r: any): GuruContact {
  return {
    contactKey: r.contact_key,
    name: r.name ?? null,
    email: r.email ?? null,
    purchases: Number(r.purchases ?? 0),
    totalSpent: Number(r.total_spent ?? 0),
    activeSubs: Number(r.active_subs ?? 0),
    lastActivity: r.last_activity ?? null,
  };
}

/** Totais da empresa inteira (pros KPIs) — uma linha da view de resumo. */
export function usePaymentContactsSummary(): GuruContactsSummary | null {
  const [summary, setSummary] = useState<GuruContactsSummary | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      await useDbStore.getState().load();
      const loc = useDbStore.getState().locationId;
      if (!loc) {
        if (active) setSummary({ contacts: 0, revenue: 0, withSubs: 0 });
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("payment_contacts_summary")
        .select("*")
        .eq("location_id", loc)
        .maybeSingle();
      if (active) {
        setSummary(
          data
            ? { contacts: Number(data.contacts), revenue: Number(data.revenue), withSubs: Number(data.with_subs) }
            : { contacts: 0, revenue: 0, withSubs: 0 }
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return summary;
}

/** Uma página de contatos, ordenada por total gasto e assinaturas. */
export function usePaymentContactsPage(page: number) {
  const [rows, setRows] = useState<GuruContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      await useDbStore.getState().load();
      const loc = useDbStore.getState().locationId;
      if (!loc) {
        if (active) {
          setRows([]);
          setTotal(0);
          setLoading(false);
        }
        return;
      }
      const supabase = createClient();
      const from = page * CONTACTS_PAGE_SIZE;
      const to = from + CONTACTS_PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("payment_contacts")
        .select("*", { count: "exact" })
        .eq("location_id", loc)
        .order("total_spent", { ascending: false })
        .order("active_subs", { ascending: false })
        .order("contact_key", { ascending: true })
        .range(from, to);
      if (!active) return;
      setRows((data ?? []).map(mapRow));
      if (typeof count === "number") setTotal(count);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [page]);

  return { rows, total, loading };
}
