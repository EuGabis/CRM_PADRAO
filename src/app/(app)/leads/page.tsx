"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanSquare, List, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { DataTable, type Column } from "@/components/shared/data-table";
import { BulkLogTab } from "@/components/contacts/module-tabs";
import { OpportunityCard } from "@/components/pipeline/opportunity-card";
import { OpportunityDialog } from "@/components/pipeline/opportunity-dialog";
import { PipelinesManageTab } from "@/components/pipeline/pipelines-manage-tab";
import { StageColumn } from "@/components/pipeline/stage-column";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbTeam } from "@/lib/data/repos/db/contacts";
import { oppActions, usePipelineDb } from "@/lib/data/repos/db/pipeline";
import { formatBRL } from "@/lib/data/repos/opportunities";
import type { Opportunity } from "@/lib/data/types";

const TABS = [{ label: "Leads" }, { label: "Pipelines" }, { label: "Ações em massa" }];

/**
 * `useSearchParams` obriga um limite de Suspense — sem ele o build falha ao
 * pré-renderizar /leads. Daí a casca abaixo.
 */
export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const [tab, setTab] = useState("Leads");
  const { pipelines, opportunities, loaded } = usePipelineDb();
  const team = useDbTeam();

  // ?pipeline=<id> vem do painel: clicar num pedaço do gráfico e escolher
  // "Abrir no funil" precisa cair no pipeline certo, não no primeiro da lista.
  const searchParams = useSearchParams();
  const [pipelineId, setPipelineId] = useState<string>(
    () => searchParams.get("pipeline") ?? ""
  );
  const pipeline =
    pipelines.find((p) => p.id === pipelineId) ?? pipelines[0] ?? null;

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const pipeOps = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          o.pipelineId === pipeline?.id &&
          (query === "" || o.name.toLowerCase().includes(query.toLowerCase()))
      ),
    [opportunities, pipeline?.id, query]
  );

  const activeOp = activeId ? opportunities.find((o) => o.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) {
      const stage = pipeline?.stages.find((s) => s.id === e.over!.id);
      if (stage) {
        const ok = await oppActions.move(String(e.active.id), stage.id);
        ok
          ? toast.success(`Lead movido para ${stage.name}`)
          : toast.error("Não foi possível mover — tente novamente");
      }
    }
  };

  const listColumns: Column<Opportunity>[] = [
    {
      key: "nome",
      header: "Nome",
      sortable: true,
      sortValue: (o) => o.name,
      render: (o) => <span className="font-medium">{o.name}</span>,
    },
    {
      key: "fase",
      header: "Fase",
      render: (o) => {
        const st = pipeline?.stages.find((s) => s.id === o.stageId);
        return (
          <Badge variant="secondary" style={{ background: `${st?.color}22`, color: st?.color }}>
            {st?.name}
          </Badge>
        );
      },
    },
    { key: "fonte", header: "Fonte", render: (o) => o.source },
    {
      key: "valor",
      header: "Valor",
      sortable: true,
      sortValue: (o) => o.value,
      render: (o) => formatBRL(o.value),
    },
    {
      key: "owner",
      header: "Responsável",
      render: (o) => team.find((u) => u.id === o.ownerId)?.name ?? "—",
    },
  ];

  function ListBulkBar({ ids, clear }: { ids: string[]; clear: () => void }) {
    const [target, setTarget] = useState<string>("");
    return (
      <>
        <span className="text-xs font-semibold text-indigo-700">
          {ids.length} selecionado{ids.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={target} onValueChange={(v) => setTarget(v ?? "")}>
            <SelectTrigger className="h-7 w-44 text-xs" size="sm">
              <SelectValue>
                {target
                  ? pipeline?.stages.find((s) => s.id === target)?.name
                  : "Mover para fase..."}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pipeline?.stages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!target}
            onClick={async () => {
              const ok = await oppActions.moveMany(ids, target);
              ok ? toast.success("Leads movidos") : toast.error("Não foi possível mover");
              clear();
            }}
          >
            Mover
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-red-600 hover:text-red-700"
            onClick={async () => {
              if (!window.confirm(`Excluir ${ids.length} oportunidade(s)?`)) return;
              const ok = await oppActions.remove(ids);
              ok ? toast.success("Excluídas") : toast.error("Não foi possível excluir");
              clear();
            }}
          >
            <Trash2 className="size-3.5" /> Excluir
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Pipelines" ? (
        <div className="p-6">
          <PipelinesManageTab />
        </div>
      ) : tab === "Ações em massa" ? (
        <div className="p-6">
          <BulkLogTab />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={pipeline?.id ?? ""}
                onValueChange={(v) => v && setPipelineId(v)}
              >
                <SelectTrigger className="h-8 w-[220px] text-xs font-semibold">
                  <SelectValue>{pipeline?.name ?? "Carregando..."}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">
                {loaded ? `${pipeOps.length} leads` : "Carregando..."}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border px-2">
                <Search className="size-3.5 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar leads"
                  className="h-7 w-36 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="flex rounded-md border">
                <button
                  onClick={() => setView("kanban")}
                  className={`flex size-8 items-center justify-center rounded-l-md ${view === "kanban" ? "bg-indigo-50 text-indigo-600" : "text-slate-400"}`}
                >
                  <KanbanSquare className="size-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`flex size-8 items-center justify-center rounded-r-md border-l ${view === "list" ? "bg-indigo-50 text-indigo-600" : "text-slate-400"}`}
                >
                  <List className="size-4" />
                </button>
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setDialogOpen(true)}
                disabled={!pipeline}
              >
                <Plus className="size-3.5" /> Adicionar oportunidade
              </Button>
            </div>
          </div>

          {view === "kanban" ? (
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
                {pipeline?.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <StageColumn
                      key={stage.id}
                      stage={stage}
                      opportunities={pipeOps.filter((o) => o.stageId === stage.id)}
                      users={team}
                    />
                  ))}
                {loaded && pipeline && pipeline.stages.length === 0 && (
                  <p className="p-6 text-sm text-slate-500">
                    Este pipeline não tem fases — crie na aba Pipelines.
                  </p>
                )}
              </div>
              <DragOverlay>
                {activeOp && (
                  <div className="w-[220px]">
                    <OpportunityCard
                      opportunity={activeOp}
                      owner={team.find((u) => u.id === activeOp.ownerId)}
                      dragging
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          ) : (
            <DataTable
              data={pipeOps}
              columns={listColumns}
              pageSize={15}
              selectable
              bulkBar={(ids, clear) => <ListBulkBar ids={ids} clear={clear} />}
            />
          )}
        </div>
      )}
      {pipeline && (
        <OpportunityDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          pipelineId={pipeline.id}
        />
      )}
    </div>
  );
}
