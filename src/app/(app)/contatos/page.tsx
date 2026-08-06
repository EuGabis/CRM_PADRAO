"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Filter, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDrawer, type FilterCondition } from "@/components/shared/filter-drawer";
import { ChannelIcon } from "@/components/shared/channel-icon";
import { BulkActions } from "@/components/contacts/bulk-actions";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUsers, contactName } from "@/lib/data/repos/contacts";
import { useDbContacts } from "@/lib/data/repos/db/contacts";
import type { Contact } from "@/lib/data/types";
import { ListChecks } from "lucide-react";

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
  const { contacts, loading } = useDbContacts();
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
        ) : tab === "Listas inteligentes" ? (
          <ListasInteligentesTab contacts={contacts} onOpen={() => setTab("Contatos")} />
        ) : tab === "Ações em massa" ? (
          <AcoesEmMassaTab />
        ) : tab === "Tarefas" ? (
          <TarefasTab contacts={contacts} />
        ) : tab === "Empresas" ? (
          <EmpresasTab contacts={contacts} />
        ) : (
          <ConfiguracoesTab contacts={contacts} />
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

/* ---------- Listas inteligentes ---------- */

const SMART_LISTS = [
  { id: "sl-1", nome: "Assinantes VIP", filtro: "Tag é 'vip'", match: (c: Contact) => c.tags.includes("vip") },
  { id: "sl-2", nome: "Assinantes", filtro: "Tag é 'assinante'", match: (c: Contact) => c.tags.includes("assinante") },
  { id: "sl-3", nome: "Em negociação", filtro: "Tag é 'negociando'", match: (c: Contact) => c.tags.includes("negociando") },
  { id: "sl-4", nome: "Leads quentes", filtro: "Tag é 'quente'", match: (c: Contact) => c.tags.includes("quente") },
  { id: "sl-5", nome: "Follow-up pendente", filtro: "Tag é 'follow-up'", match: (c: Contact) => c.tags.includes("follow-up") },
  { id: "sl-6", nome: "Sem tag (frios)", filtro: "Contato não possui tags", match: (c: Contact) => c.tags.length === 0 },
];

function ListasInteligentesTab({ contacts, onOpen }: { contacts: Contact[]; onOpen: () => void }) {
  const counts = useMemo(
    () => SMART_LISTS.map((l) => contacts.filter(l.match).length),
    [contacts]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">Listas inteligentes</h1>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de listas inteligentes chega com o backend")}>
          <Plus className="size-3.5" /> Nova lista
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SMART_LISTS.map((l, i) => (
          <div key={l.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <ListChecks className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{l.nome}</p>
                  <p className="text-[11px] text-slate-500">{l.filtro}</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {counts[i]} contato{counts[i] === 1 ? "" : "s"}
              </Badge>
            </div>
            <Button variant="outline" size="sm" className="mt-3 h-8 w-full text-xs" onClick={onOpen}>
              Abrir
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Ações em massa ---------- */

interface BulkOp {
  id: string;
  operacao: string;
  status: "Concluída" | "Processando";
  afetados: number;
  executadaPor: string;
  data: string;
}

const BULK_OPS: BulkOp[] = [
  { id: "bo-1", operacao: "Adicionar tag 'inverno26'", status: "Processando", afetados: 312, executadaPor: "Gustavo Ribeiro", data: "05 ago 2026 11:20" },
  { id: "bo-2", operacao: "Importação CSV — planilha feira", status: "Concluída", afetados: 148, executadaPor: "Camila Braga", data: "04 ago 2026 15:47" },
  { id: "bo-3", operacao: "Exportar contatos (filtro: assinantes)", status: "Concluída", afetados: 96, executadaPor: "Lucas Gomes", data: "31 jul 2026 09:05" },
  { id: "bo-4", operacao: "Remover tag 'promo-julho'", status: "Concluída", afetados: 221, executadaPor: "Rhayan Castellar", data: "28 jul 2026 17:32" },
  { id: "bo-5", operacao: "Atualizar proprietário em massa", status: "Concluída", afetados: 54, executadaPor: "Emille Lima", data: "22 jul 2026 10:11" },
];

function StatusBadge({ status }: { status: "Concluída" | "Processando" }) {
  return status === "Concluída" ? (
    <Badge className="bg-emerald-100 text-emerald-700">Concluída</Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-700">Processando</Badge>
  );
}

function AcoesEmMassaTab() {
  const columns: Column<BulkOp>[] = [
    { key: "operacao", header: "Operação", sortable: true, sortValue: (r) => r.operacao, render: (r) => <span className="font-medium text-slate-800">{r.operacao}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "afetados", header: "Registros afetados", sortable: true, sortValue: (r) => r.afetados, render: (r) => <span className="text-slate-600">{r.afetados.toLocaleString("pt-BR")}</span> },
    { key: "executada", header: "Executada por", render: (r) => <span className="text-slate-600">{r.executadaPor}</span> },
    { key: "data", header: "Data", sortable: true, sortValue: (r) => r.data, render: (r) => <span className="text-slate-500">{r.data}</span> },
  ];

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">Histórico de ações em massa</h1>
      <DataTable data={BULK_OPS} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Tarefas ---------- */

interface Tarefa {
  id: string;
  titulo: string;
  contato: string;
  responsavel: string;
  prazo: string;
  status: "Pendente" | "Concluída";
}

const TASK_TITLES = [
  "Ligar para apresentar proposta",
  "Enviar contrato por e-mail",
  "Agendar call de demonstração",
  "Cobrar retorno do teste grátis",
  "Atualizar cadastro com CNPJ",
  "Enviar pesquisa de satisfação",
];

const TASK_DEADLINES = ["06 ago 2026", "07 ago 2026", "08 ago 2026", "10 ago 2026", "12 ago 2026", "04 ago 2026"];

function TarefasTab({ contacts }: { contacts: Contact[] }) {
  const users = useUsers();
  const rows = useMemo<Tarefa[]>(
    () =>
      TASK_TITLES.map((titulo, i) => ({
        id: `tf-${i + 1}`,
        titulo,
        contato: contacts[i * 3] ? contactName(contacts[i * 3]) : "—",
        responsavel: users[i % users.length]?.name ?? "—",
        prazo: TASK_DEADLINES[i],
        status: i === 5 ? "Concluída" : "Pendente",
      })),
    [contacts, users]
  );

  const columns: Column<Tarefa>[] = [
    { key: "titulo", header: "Título", sortable: true, sortValue: (r) => r.titulo, render: (r) => <span className="font-medium text-slate-800">{r.titulo}</span> },
    { key: "contato", header: "Contato vinculado", render: (r) => <span className="text-slate-600">{r.contato}</span> },
    { key: "responsavel", header: "Responsável", render: (r) => <span className="text-slate-600">{r.responsavel}</span> },
    { key: "prazo", header: "Prazo", sortable: true, sortValue: (r) => r.prazo, render: (r) => <span className="text-slate-500">{r.prazo}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.status === "Concluída" ? (
          <Badge className="bg-emerald-100 text-emerald-700">Concluída</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900">Tarefas</h1>
          <Badge variant="secondary">{rows.filter((r) => r.status === "Pendente").length} pendentes</Badge>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de tarefas chega com o backend")}>
          <Plus className="size-3.5" /> Nova tarefa
        </Button>
      </div>
      <DataTable data={rows} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Empresas ---------- */

interface Empresa {
  id: string;
  nome: string;
  contatos: number;
  cidade: string;
  criadaEm: string;
}

const COMPANY_CITIES = ["Rio de Janeiro", "São Paulo", "Belo Horizonte", "Curitiba", "Niterói", "Campinas"];
const COMPANY_DATES = ["14 mar 2026", "02 abr 2026", "27 abr 2026", "09 mai 2026", "18 jun 2026", "30 jun 2026", "11 jul 2026", "25 jul 2026"];

function EmpresasTab({ contacts }: { contacts: Contact[] }) {
  const rows = useMemo<Empresa[]>(() => {
    const byCompany = new Map<string, number>();
    contacts.forEach((c) => {
      if (c.company) byCompany.set(c.company, (byCompany.get(c.company) ?? 0) + 1);
    });
    return [...byCompany.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, contatos], i) => ({
        id: `emp-${i + 1}`,
        nome,
        contatos,
        cidade: COMPANY_CITIES[i % COMPANY_CITIES.length],
        criadaEm: COMPANY_DATES[i % COMPANY_DATES.length],
      }));
  }, [contacts]);

  const columns: Column<Empresa>[] = [
    { key: "nome", header: "Empresa", sortable: true, sortValue: (r) => r.nome, render: (r) => <span className="font-medium text-slate-800">{r.nome}</span> },
    { key: "contatos", header: "Nº de contatos", sortable: true, sortValue: (r) => r.contatos, render: (r) => <Badge variant="secondary" className="text-[10px]">{r.contatos}</Badge> },
    { key: "cidade", header: "Cidade", render: (r) => <span className="text-slate-600">{r.cidade}</span> },
    { key: "criada", header: "Criada em", sortable: true, sortValue: (r) => r.criadaEm, render: (r) => <span className="text-slate-500">{r.criadaEm}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-900">Empresas</h1>
        <Badge variant="secondary">{rows.length} empresas</Badge>
      </div>
      <DataTable data={rows} columns={columns} pageSize={10} />
    </div>
  );
}

/* ---------- Configurações ---------- */

const EXTRA_FIELDS: { nome: string; tipo: string }[] = [
  { nome: "Data de aniversário", tipo: "Data" },
  { nome: "Plano contratado", tipo: "Dropdown" },
];

const FIELD_TYPES: Record<string, string> = {
  "Tipo de Negócio": "Dropdown",
  "Interesse com CRM": "Dropdown",
  "Fonte UTM": "Texto",
  utm_campaign: "Texto",
};

function ConfiguracoesTab({ contacts }: { contacts: Contact[] }) {
  const fields = useMemo(() => {
    const keys = contacts[0] ? Object.keys(contacts[0].customFields) : [];
    return [
      ...keys.map((k) => ({ nome: k, tipo: FIELD_TYPES[k] ?? "Texto" })),
      ...EXTRA_FIELDS,
    ];
  }, [contacts]);

  const [active, setActive] = useState<Record<string, boolean>>({});

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">Campos personalizados</h1>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de campos personalizados chega com o backend")}>
          <Plus className="size-3.5" /> Novo campo
        </Button>
      </div>
      <div className="rounded-xl border bg-white">
        {fields.map((f) => (
          <div key={f.nome} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-slate-800">{f.nome}</p>
              <Badge variant="secondary" className="text-[10px]">{f.tipo}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Ativo</span>
              <Switch
                checked={active[f.nome] ?? true}
                onCheckedChange={(v) => setActive((prev) => ({ ...prev, [f.nome]: Boolean(v) }))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
