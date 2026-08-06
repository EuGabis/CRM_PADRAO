"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Filter, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDrawer, type FilterCondition } from "@/components/shared/filter-drawer";
import { ChannelIcon } from "@/components/shared/channel-icon";
import { BulkActions } from "@/components/contacts/bulk-actions";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useContacts, contactName } from "@/lib/data/repos/contacts";
import type { Contact } from "@/lib/data/types";
import { CheckSquare, Building2, Settings, ListChecks, Users } from "lucide-react";

const TABS = [
  { label: "Contatos" },
  { label: "Listas inteligentes" },
  { label: "Ações em massa" },
  { label: "Tarefas" },
  { label: "Empresas" },
  { label: "Configurações" },
];

const FILTER_FIELDS = [
  "Nome",
  "Sobrenome",
  "E-mail",
  "Telefone",
  "Cidade",
  "País",
  "Proprietário",
  "Tag",
  "Status do e-mail",
  "UTM Campanha",
  "UTM Meio",
  "UTM Palavra-chave",
  "ID de clique do FB (fbclid)",
  "ID de clique do Google (gclid)",
  "Primeira atribuição",
  "Última atribuição",
];

function avatarColor(id: string) {
  const colors = ["bg-indigo-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500"];
  return colors[id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0) % colors.length];
}

export default function ContatosPage() {
  const router = useRouter();
  const contacts = useContacts();
  const [tab, setTab] = useState("Contatos");
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const filtered = useMemo(() => {
    if (conditions.length === 0) return contacts;
    return contacts.filter((c) =>
      conditions.every((cond) => {
        const hay =
          cond.field === "Tag"
            ? c.tags.join(" ")
            : `${contactName(c)} ${c.email} ${c.phone} ${c.company ?? ""}`.toLowerCase();
        const needle = cond.value.toLowerCase();
        if (cond.operator === "é") return hay.toLowerCase().includes(needle);
        if (cond.operator === "não é") return !hay.toLowerCase().includes(needle);
        return hay.toLowerCase().includes(needle);
      })
    );
  }, [contacts, conditions]);

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
              {c.firstName[0]}
              {c.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-slate-800">{contactName(c)}</span>
        </div>
      ),
    },
    { key: "telefone", header: "Telefone", render: (c) => <span className="text-slate-600">{c.phone}</span> },
    { key: "email", header: "E-mail", render: (c) => <span className="text-slate-600">{c.email}</span> },
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
                <Badge variant="secondary">{filtered.length} contatos</Badge>
                {conditions.length > 0 && (
                  <button
                    onClick={() => setConditions([])}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Limpar {conditions.length} filtro(s)
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
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
                  onClick={() => toast.info("Importação CSV chega com o backend")}
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
        ) : (
          <EmptyState
            icon={
              tab === "Listas inteligentes"
                ? ListChecks
                : tab === "Tarefas"
                  ? CheckSquare
                  : tab === "Empresas"
                    ? Building2
                    : tab === "Configurações"
                      ? Settings
                      : Users
            }
            title={`${tab} — em construção`}
            description="Esta sub-aba será aprofundada nas próximas etapas do Lito CRM."
          />
        )}
      </div>
      <FilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={FILTER_FIELDS}
        onApply={setConditions}
      />
      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
