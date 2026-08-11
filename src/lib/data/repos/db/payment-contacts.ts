"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Contatos da Guru: listagem/busca vem de `payment_guru_contacts` (migração
 * 0018 — cadastro real da Guru, com índices simples em name/phone/doc, ~7ms
 * por busca). Compras/total gasto/assinaturas/última atividade vêm de
 * `payment_contacts` (view agregada de payment_events+payment_subscriptions,
 * migração 0016/0019) — mas só pra os ≤20 contatos da página visível,
 * filtrando por contact_key (índices funcionais da migração 0021).
 *
 * Antes buscava/paginava direto em `payment_contacts`: o ILIKE roda DEPOIS
 * do group by, então cada tecla digitada forçava agregar as ~24k vendas +
 * 2,4k assinaturas da conta inteira (~680ms medido). Com a busca em
 * payment_guru_contacts e o enriquecimento de valores só pela página atual,
 * o mesmo fluxo cai pra poucos ms.
 *
 * Efeito colateral: a ordenação padrão deixou de ser "quem mais gastou
 * primeiro" (isso exigiria materializar a agregação) e passou a ser por
 * nome — mas os valores continuam aparecendo em cada linha.
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

function mapValuesRow(r: any): {
  purchases: number;
  totalSpent: number;
  activeSubs: number;
  lastActivity: string | null;
} {
  return {
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

/**
 * Uma página de contatos (busca/paginação em payment_guru_contacts, rápido
 * e indexado), com compras/total gasto/assinaturas/última atividade
 * enriquecidos só para essa página a partir de payment_contacts.
 */
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
      let query = supabase
        .from("payment_guru_contacts")
        .select("*", { count: "exact" })
        .eq("location_id", loc);

      const term = sanitizeSearch(search);
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,doc.ilike.%${term}%`
        );
      }

      const { data: guruRows, count } = await query
        .order("name", { ascending: true, nullsFirst: false })
        .range(from, to);

      if (!active) return;

      const keys = Array.from(
        new Set(
          (guruRows ?? [])
            .map((r: any) => (r.email ? String(r.email).toLowerCase().trim() : null))
            .filter((k: string | null): k is string => !!k)
        )
      );
      const valuesByKey = new Map<string, ReturnType<typeof mapValuesRow>>();
      if (keys.length > 0) {
        const { data: valueRows } = await supabase
          .from("payment_contacts")
          .select("contact_key, purchases, total_spent, active_subs, last_activity")
          .eq("location_id", loc)
          .in("contact_key", keys);
        for (const v of valueRows ?? []) valuesByKey.set(v.contact_key, mapValuesRow(v));
      }

      const merged: GuruContact[] = (guruRows ?? []).map((r: any) => {
        const key = r.email ? String(r.email).toLowerCase().trim() : null;
        const values = key ? valuesByKey.get(key) : undefined;
        return {
          contactKey: key ?? r.id,
          name: r.name ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
          doc: r.doc ?? null,
          purchases: values?.purchases ?? 0,
          totalSpent: values?.totalSpent ?? 0,
          activeSubs: values?.activeSubs ?? 0,
          lastActivity: values?.lastActivity ?? null,
        };
      });

      if (!active) return;
      setRows(merged);
      if (typeof count === "number") setTotal(count);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [page, search]);

  return { rows, total, loading };
}
