"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FolderPlus, Plus, Sparkles, Workflow as WorkflowIcon } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkflows, workflowActions } from "@/lib/data/repos/workflows";
import type { Workflow } from "@/lib/data/types";

const TABS = [{ label: "Fluxos de trabalho" }, { label: "Configurações globais" }];

export default function AutomacoesPage() {
  const router = useRouter();
  const [tab, setTab] = useState("Fluxos de trabalho");
  const workflows = useWorkflows();

  const folders = useMemo(() => {
    const set = new Set<string>();
    workflows.forEach((w) => w.folder && set.add(w.folder));
    return [...set].sort();
  }, [workflows]);

  const create = () => {
    const name = window.prompt("Nome do novo fluxo de trabalho:", "Novo fluxo");
    if (!name?.trim()) return;
    const id = workflowActions.create(name.trim());
    toast.success("Fluxo criado como rascunho");
    router.push(`/automacoes/${id}`);
  };

  const columns: Column<Workflow>[] = [
    {
      key: "nome",
      header: "Nome",
      sortable: true,
      sortValue: (w) => w.name,
      render: (w) => (
        <div>
          <p className="font-medium text-slate-800">{w.name}</p>
          {w.folder && <p className="text-[10px] text-slate-400">📁 {w.folder}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (w) => w.status,
      render: (w) =>
        w.status === "published" ? (
          <Badge className="bg-emerald-100 text-emerald-700">Publicado</Badge>
        ) : (
          <Badge variant="secondary">Rascunho</Badge>
        ),
    },
    {
      key: "total",
      header: "Total de inscritos",
      sortable: true,
      sortValue: (w) => w.enrolledTotal,
      render: (w) => w.enrolledTotal.toLocaleString("pt-BR"),
    },
    {
      key: "ativos",
      header: "Inscritos ativos",
      sortable: true,
      sortValue: (w) => w.enrolledActive,
      render: (w) => w.enrolledActive.toLocaleString("pt-BR"),
    },
    {
      key: "atualizado",
      header: "Última atualização",
      sortable: true,
      sortValue: (w) => w.updatedAt,
      render: (w) => (
        <span className="text-slate-500">
          {format(new Date(w.updatedAt), "d MMM yyyy HH:mm", { locale: ptBR })}
        </span>
      ),
    },
  ];

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab !== "Fluxos de trabalho" ? (
          <EmptyState
            icon={WorkflowIcon}
            title="Configurações globais — em construção"
            description="Configurações globais de automações serão aprofundadas depois."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Lista de fluxos de trabalho</h1>
                {folders.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Pastas: {folders.join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => toast.info("Criação de pastas chega em breve")}
                >
                  <FolderPlus className="size-3.5" /> Criar pasta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-indigo-300 text-xs text-indigo-600 hover:bg-indigo-50"
                  onClick={() => toast.info("Geração de fluxos com IA chega em breve")}
                >
                  <Sparkles className="size-3.5" /> Construa usando IA
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={create}>
                  <Plus className="size-3.5" /> Criar fluxo de trabalho
                </Button>
              </div>
            </div>
            <DataTable
              data={workflows}
              columns={columns}
              searchPlaceholder="Pesquisar fluxos"
              searchFn={(w, q) => `${w.name} ${w.folder ?? ""}`.toLowerCase().includes(q)}
              pageSize={10}
              onRowClick={(w) => router.push(`/automacoes/${w.id}`)}
            />
          </>
        )}
      </div>
    </div>
  );
}
