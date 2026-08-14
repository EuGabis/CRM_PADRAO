"use client";

import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Painel de filtros das abas de Pagamentos, no formato do painel da Guru:
 * um bloco "Datas" (qual data + período) e um "Características" (status,
 * produto, busca), com Limpar/Filtrar no rodapé.
 *
 * Os filtros só oferecem campos que EXISTEM nas nossas tabelas. A Guru filtra
 * por "Aprovada em" e "Forma de pagamento", que não guardamos em coluna
 * própria (ficam dentro do `raw`) — oferecer isso aqui daria resultado errado.
 */

export interface PaymentFilters {
  /** Coluna de data usada no período. */
  dateField: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  status: string[];
  product: string;
  search: string;
}

export interface DateFieldOption {
  value: string;
  label: string;
}

export interface StatusOption {
  value: string;
  label: string;
}

export function emptyFilters(dateField: string): PaymentFilters {
  return { dateField, from: "", to: "", status: [], product: "", search: "" };
}

/** Quantos filtros estão valendo — vira o número na bolinha do botão. */
export function countActiveFilters(f: PaymentFilters): number {
  return (
    (f.from || f.to ? 1 : 0) +
    (f.status.length > 0 ? 1 : 0) +
    (f.product.trim() ? 1 : 0) +
    (f.search.trim() ? 1 : 0)
  );
}

export function FilterButton({
  active,
  open,
  onClick,
}: {
  active: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
        open || active > 0
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "text-slate-500 hover:bg-slate-50"
      )}
    >
      <Filter className="size-3.5" />
      Filtros
      {active > 0 && (
        <span className="rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">
          {active}
        </span>
      )}
    </button>
  );
}

export function FilterPanel({
  open,
  value,
  onApply,
  onClose,
  dateFields,
  statusOptions,
  productLabel = "Produto",
  searchLabel = "Buscar",
  searchPlaceholder = "Código, contato ou e-mail",
  showProduct = true,
  showSearch = true,
}: {
  open: boolean;
  value: PaymentFilters;
  onApply: (f: PaymentFilters) => void;
  onClose: () => void;
  dateFields: DateFieldOption[];
  statusOptions?: StatusOption[];
  productLabel?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  showProduct?: boolean;
  showSearch?: boolean;
}) {
  // Rascunho local: o filtro só vale quando clica em "Filtrar", como na Guru.
  const [draft, setDraft] = useState<PaymentFilters>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const toggleStatus = (s: string) =>
    setDraft((d) => ({
      ...d,
      status: d.status.includes(s) ? d.status.filter((x) => x !== s) : [...d.status, s],
    }));

  return (
    <div className="mb-4 rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-800">Filtros</p>
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
        >
          <X className="size-3" /> Fechar
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Datas */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Datas
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap gap-3">
              {dateFields.map((f) => (
                <Label
                  key={f.value}
                  className="flex items-center gap-1.5 text-[11px] font-normal text-slate-600"
                >
                  <input
                    type="radio"
                    name="dateField"
                    checked={draft.dateField === f.value}
                    onChange={() => setDraft((d) => ({ ...d, dateField: f.value }))}
                    className="size-3.5 accent-indigo-500"
                  />
                  {f.label}
                </Label>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">De</Label>
                <Input
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="h-7 w-36 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Até</Label>
                <Input
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="h-7 w-36 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Características */}
        {(statusOptions || showProduct || showSearch) && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Características
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {showSearch && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">{searchLabel}</Label>
                  <Input
                    value={draft.search}
                    onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                    placeholder={searchPlaceholder}
                    className="h-7 text-xs"
                  />
                </div>
              )}
              {showProduct && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">{productLabel}</Label>
                  <Input
                    value={draft.product}
                    onChange={(e) => setDraft((d) => ({ ...d, product: e.target.value }))}
                    placeholder="Nome do produto"
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </div>

            {statusOptions && statusOptions.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-[10px] text-slate-500">Status</Label>
                  {draft.status.length > 0 && (
                    <button
                      onClick={() => setDraft((d) => ({ ...d, status: [] }))}
                      className="text-[10px] text-slate-400 hover:underline"
                    >
                      Limpar status
                    </button>
                  )}
                </div>
                <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border p-2.5 md:grid-cols-3">
                  {statusOptions.map((s) => (
                    <Label
                      key={s.value}
                      className="flex items-center gap-1.5 text-[11px] font-normal text-slate-600"
                    >
                      <Checkbox
                        checked={draft.status.includes(s.value)}
                        onCheckedChange={() => toggleStatus(s.value)}
                      />
                      {s.label}
                    </Label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t px-4 py-2.5">
        <button
          onClick={() => {
            const cleared = emptyFilters(dateFields[0]?.value ?? draft.dateField);
            setDraft(cleared);
            onApply(cleared);
          }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Limpar filtros
        </button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onApply(draft)}>
          Filtrar
        </Button>
      </div>
    </div>
  );
}

/** Filtro em memória — usado nas abas cujos dados já vêm inteiros para o client. */
export function matchesFilters(
  f: PaymentFilters,
  row: {
    date: string | null;
    status: string | null;
    product: string | null;
    haystack: string[];
  }
): boolean {
  if (f.from || f.to) {
    if (!row.date) return false;
    const day = row.date.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  if (f.status.length > 0 && !f.status.includes((row.status ?? "").toLowerCase())) return false;
  if (f.product.trim()) {
    const p = f.product.trim().toLowerCase();
    if (!(row.product ?? "").toLowerCase().includes(p)) return false;
  }
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!row.haystack.some((h) => (h ?? "").toLowerCase().includes(q))) return false;
  }
  return true;
}
