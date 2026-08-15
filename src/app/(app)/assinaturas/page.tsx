"use client";

import { useState, type ReactNode } from "react";
import { Award, Copy, GraduationCap, Link2, Mail, Plus, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/config/brand";
import { contactName, useContacts } from "@/lib/data/repos/contacts";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Portal do cliente" },
  { label: "Cursos" },
  { label: "Comunidades" },
  { label: "Certificados" },
  { label: "Marketplace" },
];

const PORTAL_URL = "https://clientes.crmon.com.br";

const COURSES = [
  { title: "CRM na Prática", subtitle: "40 aulas avançadas", students: 148, completion: 72, status: "Publicado" },
  { title: "Funil de Vendas do Zero", subtitle: "24 aulas + templates", students: 96, completion: 58, status: "Publicado" },
  { title: "Automação com Agente de IA", subtitle: "16 aulas — turma de agosto", students: 34, completion: 12, status: "Publicado" },
];

const COMMUNITIES = [
  { name: "Comunidade CRM ON", members: 412, postsWeek: 38, status: "Ativa" },
  { name: "Alunos — CRM na Prática", members: 148, postsWeek: 21, status: "Ativa" },
];

const CERTIFICATES = [
  { course: "CRM na Prática", issued: "22 jul 2026", code: "LT-CERT-0148" },
  { course: "CRM na Prática", issued: "15 jul 2026", code: "LT-CERT-0141" },
  { course: "Funil de Vendas do Zero", issued: "3 jul 2026", code: "LT-CERT-0126" },
  { course: "Funil de Vendas do Zero", issued: "18 jun 2026", code: "LT-CERT-0112" },
];

const MARKETPLACE_TEMPLATES = [
  { name: "Onboarding de clientes SaaS", category: "Curso", price: "Gratuito" },
  { name: "Treinamento de equipe comercial", category: "Curso", price: "Gratuito" },
  { name: "Área de membros — Mentoria", category: "Comunidade", price: "Gratuito" },
  { name: "Mini-curso de captação de leads", category: "Curso", price: "Gratuito" },
];

function MiniTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b text-[11px] text-slate-400">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b last:border-0">
              {cells.map((c, j) => (
                <td
                  key={j}
                  className={cn("px-4 py-2.5", j === 0 ? "font-medium text-slate-800" : "text-slate-500")}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AssinaturasPage() {
  const [tab, setTab] = useState("Portal do cliente");
  const contacts = useContacts();

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Portal do cliente" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Portal do cliente</h1>
            <p className="mb-4 text-xs text-slate-500">
              Seus clientes fazem login a qualquer momento para acessar cursos e gerenciar
              pagamentos.
            </p>
            <div className="mb-4 flex items-center justify-between rounded-xl border bg-white p-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">URL do Portal do cliente</p>
                <p className="text-sm font-bold text-indigo-600">{PORTAL_URL}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(PORTAL_URL);
                  toast.success("URL copiada");
                }}
              >
                <Copy className="size-3.5" /> Copiar
              </Button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <KpiCard label="Convidados" value="0" />
              <KpiCard label="Usuários ativos" value="25" delta={12.5} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { icon: Wand2, title: "Gerar link mágico", desc: "Login sem senha para um cliente", action: "Gerar" },
                { icon: Link2, title: "Convidar para o portal", desc: "Envie um convite de acesso", action: "Convidar" },
                { icon: Mail, title: "Enviar e-mail de login", desc: "Reenvie as credenciais de acesso", action: "Enviar" },
              ].map(({ icon: Icon, title, desc, action }) => (
                <div key={title} className="rounded-xl border bg-white p-4">
                  <Icon className="size-5 text-indigo-500" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{desc}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info(`${title} chega com o backend`)}
                  >
                    {action}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Cursos" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Cursos</h1>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de curso chega com o backend")}>
                <Plus className="size-3.5" /> Novo curso
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {COURSES.map((c) => (
                <div key={c.title} className="rounded-xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                      <p className="text-[11px] text-slate-500">{c.subtitle}</p>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      {c.status}
                    </Badge>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
                    <GraduationCap className="size-3.5 text-indigo-500" /> {c.students} alunos
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Conclusão média</span>
                      <span className="font-semibold text-slate-700">{c.completion}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${c.completion}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Comunidades" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Comunidades</h1>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de comunidade chega com o backend")}>
                <Plus className="size-3.5" /> Nova comunidade
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {COMMUNITIES.map((c) => (
                <div key={c.name} className="rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-indigo-500" /> {c.members} membros
                    </span>
                    <span>{c.postsWeek} posts/semana</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Certificados" && (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">Certificados</h1>
            <div className="mb-4 flex max-w-lg items-center gap-4 rounded-xl border bg-white p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Award className="size-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Template padrão</p>
                <p className="text-[11px] text-slate-500">
                  Certificado emitido automaticamente com a marca {brand.name} ao concluir 100% das
                  aulas.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 shrink-0 text-xs"
                onClick={() => toast.info("Editor de certificados chega com o backend")}
              >
                Editar
              </Button>
            </div>
            <MiniTable
              headers={["Aluno", "Curso", "Emitido em", "Código"]}
              rows={CERTIFICATES.map((cert, i) => {
                const contact = contacts[i % Math.max(contacts.length, 1)];
                return [
                  contact ? contactName(contact) : "—",
                  cert.course,
                  cert.issued,
                  <span key="c" className="font-mono text-[11px] text-slate-600">{cert.code}</span>,
                ];
              })}
            />
          </>
        )}
        {tab === "Marketplace" && (
          <>
            <div className="mb-4">
              <h1 className="text-lg font-bold text-slate-900">Marketplace</h1>
              <p className="text-xs text-slate-500">
                Templates prontos de cursos e comunidades para instalar na sua conta
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {MARKETPLACE_TEMPLATES.map((t) => (
                <div key={t.name} className="flex flex-col rounded-xl border bg-white p-4">
                  <Badge variant="secondary" className="w-fit">
                    {t.category}
                  </Badge>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-600">{t.price}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 w-fit text-xs"
                    onClick={() => toast.info("Instalação de template chega com o backend")}
                  >
                    Instalar
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
