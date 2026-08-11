"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDbStore } from "./contacts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Contatos reais da Guru (GET /api/v2/contacts, migração 0018) — sincronizados
 * em `payment_guru_contacts` por /api/integrations/guru/sync (contactsSyncChunk).
 * Diferente da v1 (que agregava a partir de vendas/assinaturas e não tinha
 * telefone/documento), aqui é o cadastro de contatos da própria Guru, com a
 * mesma contagem total que aparece no painel dela.
 */

export const CONTACTS_PAGE_SIZE = 20;

export interface GuruContactRow {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  doc: string | null;
  phone: string | null;
  guruCreatedAt: string | null;
  guruUpdatedAt: string | null;
}

export interface GuruContactsSyncStatus {
  totalRows: number | null;
  synced: number;
  done: boolean;
}

function mapRow(r: any): GuruContactRow {
  return {
    id: r.id,
    externalId: r.external_id,
    name: r.name ?? null,
    email: r.email ?? null,
    doc: r.doc ?? null,
    phone: r.phone ?? null,
    guruCreatedAt: r.guru_created_at ?? null,
    guruUpdatedAt: r.guru_updated_at ?? null,
  };
}

/** Remove caracteres que quebram a sintaxe de filtro do PostgREST (.or()). */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()%]/g, "").trim();
}

/** Progresso da sincronização — pro card da Guru e pro cabeçalho da aba Contatos. */
export function usePaymentContactsSyncStatus(): GuruContactsSyncStatus | null {
  const [status, setStatus] = useState<GuruContactsSyncStatus | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      await useDbStore.getState().load();
      const loc = useDbStore.getState().locationId;
      if (!loc) {
        if (active) setStatus({ totalRows: null, synced: 0, done: false });
        return;
      }
      const supabase = createClient();
      const [{ data: cred }, { count }] = await Promise.all([
        supabase
          .from("payment_credentials")
          .select("contacts_total_rows, contacts_sync_done")
          .eq("location_id", loc)
          .eq("provider", "guru")
          .maybeSingle(),
        supabase
          .from("payment_guru_contacts")
          .select("*", { count: "exact", head: true })
          .eq("location_id", loc),
      ]);
      if (active) {
        setStatus({
          totalRows: cred?.contacts_total_rows ?? null,
          synced: count ?? 0,
          done: cred?.contacts_sync_done ?? false,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return status;
}

/** Uma página de contatos, com busca opcional por nome/email/telefone/documento. */
export function usePaymentContactsPage(page: number, search: string) {
  const [rows, setRows] = useState<GuruContactRow[]>([]);
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

      const { data, count } = await query
        .order("name", { ascending: true, nullsFirst: false })
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
