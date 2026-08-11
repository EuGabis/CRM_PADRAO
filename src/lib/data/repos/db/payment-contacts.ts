"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Contatos da Guru = compradores/assinantes agregados no banco pelas views
 * `payment_contacts` / `payment_contacts_summary` (migração 0016, com
 * telefone/documento adicionados na 0018+0019 via join com
 * `payment_guru_contacts`, o cadastro real de contatos da Guru). NÃO deriva
 * do store em memória (que carrega só as 100 vendas mais recentes) — aqui
 * paginamos direto no Postgres pra cobrir todo o histórico, como o painel
 * da Guru.
 */

export const CONTACTS_PAGE_SIZE = 20;

export interface GuruContact {
  contactKey: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  doc: string | null;
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
    phone: r.phone ?? null,
    doc: r.doc ?? null,
    purchases: Number(r.purchases ?? 0),
    totalSpent: Number(r.total_spent ?? 0),
    activeSubs: Number(r.active_subs ?? 0),
    lastActivity: r.last_activity ?? null,
  };
}

/** Remove caracteres que quebram a sintaxe de filtro do PostgREST (.or()). */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()%]/g, "").trim();
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

/** Uma página de contatos, ordenada por total gasto e assinaturas, com busca opcional por nome/email/telefone/documento. */
export function usePaymentContactsPage(page: number, search: string) {
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
      let query = supabase.from("payment_contacts").select("*", { count: "exact" }).eq("location_id", loc);

      const term = sanitizeSearch(search);
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,doc.ilike.%${term}%`
        );
      }

      const { data, count } = await query
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
  }, [page, search]);

  return { rows, total, loading };
}
