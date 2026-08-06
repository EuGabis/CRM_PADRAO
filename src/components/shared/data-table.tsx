"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchPlaceholder,
  searchFn,
  selectable,
  bulkBar,
  pageSize = 10,
  onRowClick,
}: {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchFn?: (row: T, q: string) => boolean;
  selectable?: boolean;
  bulkBar?: (ids: string[], clear: () => void) => ReactNode;
  pageSize?: number;
  onRowClick?: (row: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let rows = data;
    if (query && searchFn) rows = rows.filter((r) => searchFn(r, query.toLowerCase()));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const sv = col?.sortValue;
      if (sv) {
        rows = [...rows].sort((a, b) => {
          const va = sv(a);
          const vb = sv(b);
          const cmp = typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "pt-BR");
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return rows;
  }, [data, query, searchFn, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }
    );

  const clear = () => setSelected([]);

  return (
    <div className="rounded-xl border bg-white">
      {selected.length > 0 && bulkBar ? (
        <div className="flex items-center gap-3 border-b bg-indigo-50/60 px-4 py-2">
          {bulkBar(selected, clear)}
        </div>
      ) : (
        searchFn && (
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Search className="size-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder ?? "Pesquisar"}
              className="h-8 border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        )
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={(v) =>
                    setSelected((prev) =>
                      v
                        ? [...new Set([...prev, ...pageIds])]
                        : prev.filter((id) => !pageIds.includes(id))
                    )
                  }
                />
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead key={col.key}>
                {col.sortable ? (
                  <button
                    className="flex items-center gap-1 font-medium hover:text-slate-900"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-slate-300" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && "cursor-pointer")}
              onClick={() => onRowClick?.(row)}
            >
              {selectable && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onCheckedChange={(v) =>
                      setSelected((prev) =>
                        v ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                      )
                    }
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col.key}>{col.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
          {pageRows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="py-10 text-center text-sm text-slate-500"
              >
                Nenhum registro encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-slate-500">
        <span>
          {filtered.length} registro{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Próximo
          </Button>
        </div>
      </div>
    </div>
  );
}
