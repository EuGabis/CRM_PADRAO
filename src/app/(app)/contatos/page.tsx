"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Filter, Plus, Upload } from "lucide-react";
import { SubNav } from "@/components/layout/subnav";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDrawer, type FilterCondition } from "@/components/shared/filter-drawer";
import { ChannelIcon } from "@/components/shared/channel-icon";
import { BulkActions } from "@/components/contacts/bulk-actions";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { ImportDialog, exportContactsCsv } from "@/components/contacts/import-export";
import {
  BulkLogTab,
  CompaniesTab,
  FieldsTab,
  SmartListsTab,
  TasksTab,
  matchesConditions,
} from "@/components/contacts/module-tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contactName } from "@/lib/data/repos/contacts";
import { useDbContacts } from "@/lib/data/repos/db/contacts";
import type { Contact } from "@/lib/data/types";

const TABS = [
  { label: "Contatos" },
  { label: "Listas inteligentes" },
  { label: "Ações em massa" },
  { label: "Tarefas" },
  { label: "Empresas" },
  { label: "Configurações" },
];

const FILTER_FIELDS = ["Nome", "E-mail", "Telefone", "Empresa", "Tag"];

function avatarColor(id: string) {
  const colors = ["bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500"];
  return colors[id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0) % colors.length];
}

export default function ContatosPage() {
  const router = useRouter();
  const { contacts, loading } = useDbContacts();
  const [tab, setTab] = useState("Contatos");
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const filtered = useMemo(
    () => contacts.filter((c) => matchesConditions(c, conditions)),
    [contacts, conditions]
  );

  const applySmartList = (conds: FilterCondition[]) => {
    setConditions(conds);
    setTab("Contatos");
  };

  const columns: Column<Contact>[] = [
    {
      key: "nome",
      header: "Nome do Contato",
      sortable: true,
      sortValue: (c) => contactName(c),
      render: (c) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className={`${avatarColor(c.id)} text-[10px] font-bold text-white`}>
              {(c.firstName[0] ?? "?").toUpperCase()}
              {(c.lastName[0] ?? "").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-slate-800">{contactName(c)}</span>
        </div>
      ),
    },
    { key: "telefone", header: "Telefone", render: (c) => <span className="text-slate-600">{c.phone || "—"}</span> },
    { key: "email", header: "E-mail", render: (c) => <span className="text-slate-600">{c.email || "—"}</span> },
    {
      key: "empresa",
      header: "Nome comercial",
      sortable: true,
      sortValue: (c) => c.company ?? "",
      render: (c) => <span className="text-slate-600">{c.company ?? "—"}</span>,
    },
    {
      key: "criado",
      header: "Criado (-03)",
      sortable: true,
      sortValue: (c) => c.createdAt,
      render: (c) => (
        <span className="text-slate-500">
          {format(new Date(c.createdAt), "d MMM yyyy HH:mm", { locale: ptBR })}
        </span>
      ),
    },
    {
      key: "atividade",
      header: "Última atividade",
      sortable: true,
      sortValue: (c) => c.lastActivityAt,
      render: (c) => (
        <span className="flex items-center gap-1.5 text-slate-500">
          <ChannelIcon channel={c.lastActivityChannel} size={16} />
          {formatDistanceToNow(new Date(c.lastActivityAt), { locale: ptBR, addSuffix: true })}
        </span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Contatos" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold text-slate-900">Contatos</h1>
                <Badge variant="secondary">
                  {loading ? "Carregando..." : `${filtered.length} contatos`}
                </Badge>
                {conditions.length > 0 && (
                  <button
                    onClick={() => setConditions([])}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Limpar {conditions.length} filtro(s)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setFilterOpen(true)}
                >
                  <Filter className="size-3.5" /> Filtros avançados
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => exportContactsCsv(filtered)}
                >
                  <Download className="size-3.5" /> Exportar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="size-3.5" /> Importar
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setFormOpen(true)}>
                  <Plus className="size-3.5" /> Adicionar Contato
                </Button>
              </div>
            </div>
            <DataTable
              data={filtered}
              columns={columns}
              selectable
              searchPlaceholder="Pesquisar contatos"
              searchFn={(c, q) =>
                `${contactName(c)} ${c.email} ${c.phone} ${c.company ?? ""} ${c.tags.join(" ")}`
                  .toLowerCase()
                  .includes(q)
              }
              bulkBar={(ids, clear) => <BulkActions ids={ids} clear={clear} />}
              pageSize={12}
              onRowClick={(c) => router.push(`/contatos/${c.id}`)}
            />
          </>
        ) : tab === "Listas inteligentes" ? (
          <SmartListsTab contacts={contacts} onApply={applySmartList} />
        ) : tab === "Ações em massa" ? (
          <BulkLogTab />
        ) : tab === "Tarefas" ? (
          <TasksTab contacts={contacts} />
        ) : tab === "Empresas" ? (
          <CompaniesTab contacts={contacts} />
        ) : (
          <FieldsTab />
        )}
      </div>
      <FilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={FILTER_FIELDS}
        onApply={setConditions}
      />
      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
