"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowUpDown,
  Filter,
  KanbanSquare,
  List,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable, type Column } from "@/components/shared/data-table";
import { OpportunityCard } from "@/components/pipeline/opportunity-card";
import { OpportunityDialog } from "@/components/pipeline/opportunity-dialog";
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
import { useUsers } from "@/lib/data/repos/contacts";
import {
  formatBRL,
  opportunityActions,
  useOpportunities,
  usePipeline,
  usePipelines,
} from "@/lib/data/repos/opportunities";
import type { Opportunity } from "@/lib/data/types";

const TABS = [{ label: "Leads" }, { label: "Pipelines" }, { label: "Ações em massa" }];

export default function LeadsPage() {
  const [tab, setTab] = useState("Leads");
  const pipelines = usePipelines();
  const [pipelineId, setPipelineId] = useState("pipe-controle");
  const pipeline = usePipeline(pipelineId);
  const allOps = useOpportunities();
  const users = useUsers();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const pipeOps = useMemo(
    () =>
      allOps.filter(
        (o) =>
          o.pipelineId === pipelineId &&
          (query === "" || o.name.toLowerCase().includes(query.toLowerCase()))
      ),
    [allOps, pipelineId, query]
  );

  const activeOp = activeId ? allOps.find((o) => o.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) {
      const stage = pipeline?.stages.find((s) => s.id === e.over!.id);
      if (stage) {
        opportunityActions.move(String(e.active.id), stage.id);
        toast.success(`Lead movido para ${stage.name}`);
      }
    }
  };

  const listColumns: Column<Opportunity>[] = [
    { key: "nome", header: "Nome", sortable: true, sortValue: (o) => o.name, render: (o) => <span className="font-medium">{o.name}</span> },
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
    { key: "valor", header: "Valor", sortable: true, sortValue: (o) => o.value, render: (o) => formatBRL(o.value) },
    {
      key: "owner",
      header: "Responsável",
      render: (o) => users.find((u) => u.id === o.ownerId)?.name ?? "—",
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      {tab !== "Leads" ? (
        <div className="p-6">
          <EmptyState
            icon={KanbanSquare}
            title={`${tab} — em construção`}
            description="Gestão de pipelines e ações em massa serão aprofundadas nas próximas etapas."
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select value={pipelineId} onValueChange={(v) => v && setPipelineId(v)}>
                <SelectTrigger className="h-8 w-[220px] text-xs font-semibold">
                  <SelectValue>{pipeline?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">{pipeOps.length} leads</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => toast.info("Filtros avançados de leads chegam em breve")}
              >
                <Filter className="size-3.5" /> Filtros avançados
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => toast.info("Ordenação personalizada em breve")}
              >
                <ArrowUpDown className="size-3.5" /> Classificar
              </Button>
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
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => toast.info("Importação de oportunidades chega com o backend")}
              >
                <Upload className="size-3.5" /> Importar
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
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
                      users={users}
                    />
                  ))}
              </div>
              <DragOverlay>
                {activeOp && (
                  <div className="w-[220px]">
                    <OpportunityCard
                      opportunity={activeOp}
                      owner={users.find((u) => u.id === activeOp.ownerId)}
                      dragging
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          ) : (
            <DataTable data={pipeOps} columns={listColumns} pageSize={15} />
          )}
        </div>
      )}
      <OpportunityDialog open={dialogOpen} onOpenChange={setDialogOpen} pipelineId={pipelineId} />
    </div>
  );
}
