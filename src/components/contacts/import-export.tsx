"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { contactName } from "@/lib/data/repos/contacts";
import { dbContactActions } from "@/lib/data/repos/db/contacts";
import { logBulk } from "@/lib/data/repos/db/contacts-module";
import type { Contact } from "@/lib/data/types";

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  tags: string[];
}

/** Parser CSV simples: detecta , ou ; e respeita aspas duplas. */
function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitLine(lines[0]).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
  );
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));

  const iFirst = idx("nome", "first_name", "firstname", "name");
  const iLast = idx("sobrenome", "last_name", "lastname");
  const iEmail = idx("email", "e-mail");
  const iPhone = idx("telefone", "phone", "celular", "whatsapp");
  const iCompany = idx("empresa", "company", "nome comercial");
  const iTags = idx("tags", "etiquetas");

  if (iFirst === -1) return [];

  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const get = (i: number) => (i >= 0 ? (cols[i] ?? "") : "");
    return {
      firstName: get(iFirst),
      lastName: get(iLast),
      email: get(iEmail),
      phone: get(iPhone),
      company: get(iCompany) || undefined,
      tags: get(iTags)
        .split(/[|,]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    };
  });
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error(
        'CSV inválido. A primeira linha precisa ter cabeçalhos (ex.: "nome;sobrenome;email;telefone;empresa;tags")'
      );
      return;
    }
    setFileName(file.name);
    setRows(parsed.filter((r) => r.firstName));
  };

  const run = async () => {
    setImporting(true);
    const inserted = await dbContactActions.bulkInsert(rows);
    setImporting(false);
    if (inserted < 0) {
      toast.error("A importação falhou — verifique o arquivo e tente novamente");
      return;
    }
    await logBulk(`Importação CSV — ${fileName ?? "arquivo"}`, inserted);
    toast.success(`${inserted} contato(s) importado(s)`);
    setRows([]);
    setFileName(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar contatos (CSV)</DialogTitle>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {rows.length === 0 ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-10 text-indigo-600 hover:bg-indigo-50"
          >
            <UploadCloud className="size-8" />
            <span className="text-sm font-semibold">Escolher arquivo CSV</span>
            <span className="text-[11px] text-indigo-400">
              Cabeçalhos aceitos: nome, sobrenome, email, telefone, empresa, tags
            </span>
          </button>
        ) : (
          <div className="rounded-lg border bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-800">{fileName}</p>
            <p className="text-xs text-slate-500">
              {rows.length} contato(s) prontos para importar. Exemplo:{" "}
              <span className="font-medium text-slate-700">
                {rows[0].firstName} {rows[0].lastName} · {rows[0].email || rows[0].phone || "—"}
              </span>
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={rows.length === 0 || importing} onClick={run}>
            {importing ? "Importando..." : `Importar ${rows.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Exporta os contatos para CSV e registra no log de ações em massa. */
export function exportContactsCsv(contacts: Contact[]) {
  if (contacts.length === 0) {
    toast.error("Nada para exportar");
    return;
  }
  const esc = (v: string) => `"${(v ?? "").replaceAll('"', '""')}"`;
  const header = "nome;sobrenome;email;telefone;empresa;tags";
  const lines = contacts.map((c) =>
    [c.firstName, c.lastName, c.email, c.phone, c.company ?? "", c.tags.join("|")]
      .map(esc)
      .join(";")
  );
  const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contatos-lito-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  void logBulk("Exportação de contatos (CSV)", contacts.length);
  toast.success(
    `${contacts.length} contato(s) exportado(s) — ${contacts.length === 1 ? "" : "ex.: "}${contactName(contacts[0])}${contacts.length > 1 ? "..." : ""}`
  );
}
