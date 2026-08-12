"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { ImportDialog } from "@/components/contacts/import-export";
import { BulkLogTab } from "@/components/contacts/module-tabs";

/**
 * Importação real de contatos por CSV (mesmo ImportDialog da tela de
 * Contatos, que grava via dbContactActions.bulkInsert e registra em
 * bulk_logs). Antes esta página tinha um dropzone que só emitia um toast
 * "chega com o backend" e uma tabela fixa de importações que nunca
 * aconteceram — o histórico agora é o log real de ações em massa.
 */
export default function ImportarPage() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-slate-900">Importar dados</h1>
      <p className="mb-5 text-xs text-slate-500">
        Traga contatos de outras plataformas via CSV. A primeira linha precisa ter os cabeçalhos
        (ex.: <code className="text-[11px]">nome;sobrenome;email;telefone;empresa;tags</code>).
      </p>
      <button
        onClick={() => setImportOpen(true)}
        className="mb-6 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-10 text-indigo-600 hover:bg-indigo-50"
      >
        <UploadCloud className="size-8" />
        <span className="text-sm font-semibold">Escolher um arquivo CSV</span>
        <span className="text-[11px] text-indigo-400">
          Você confere quantos contatos foram lidos antes de confirmar
        </span>
      </button>
      <BulkLogTab />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
