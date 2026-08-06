"use client";

import { use } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/shared/channel-icon";
import { useContact, useUsers, contactName } from "@/lib/data/repos/contacts";
import { formatBRL, useOpportunitiesByContact, usePipelines } from "@/lib/data/repos/opportunities";

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contact = useContact(id);
  const users = useUsers();
  const opportunities = useOpportunitiesByContact(id);
  const pipelines = usePipelines();

  if (!contact) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Contato não encontrado.</p>
        <Link href="/contatos" className="text-sm text-indigo-600 hover:underline">
          Voltar para contatos
        </Link>
      </div>
    );
  }

  const owner = users.find((u) => u.id === contact.ownerId);

  return (
    <div className="p-6">
      <Link
        href="/contatos"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" /> Contatos
      </Link>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-indigo-500 text-base font-bold text-white">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{contactName(contact)}</h1>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ChannelIcon channel={contact.lastActivityChannel} size={14} />
              {contact.company ?? "Sem empresa"} · Proprietário: {owner?.name ?? "—"}
            </p>
          </div>
        </div>
        <Link href="/conversas">
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <MessageSquare className="size-3.5" /> Abrir conversa
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Campos do contato</h2>
          <dl className="space-y-2 text-sm">
            {[
              ["Nome", contact.firstName],
              ["Sobrenome", contact.lastName],
              ["E-mail", contact.email],
              ["Telefone", contact.phone],
              ["Empresa", contact.company ?? "—"],
              ["DND", contact.dnd ? "Ativado" : "Desativado"],
              [
                "Criado em",
                format(new Date(contact.createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR }),
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b pb-2 last:border-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800">{v}</dd>
              </div>
            ))}
            {Object.entries(contact.customFields).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b pb-2 last:border-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Oportunidades</h2>
          {opportunities.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma oportunidade para este contato.</p>
          ) : (
            <ul className="space-y-2">
              {opportunities.map((o) => {
                const pipeline = pipelines.find((p) => p.id === o.pipelineId);
                const stage = pipeline?.stages.find((s) => s.id === o.stageId);
                return (
                  <li key={o.id} className="rounded-lg border p-3">
                    <p className="text-xs font-semibold text-slate-500">
                      {pipeline?.name} &gt; {stage?.name}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{o.name}</span>
                      <span className="text-sm font-bold text-slate-900">{formatBRL(o.value)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Fonte: {o.source} · Status:{" "}
                      {o.status === "open" ? "Aberta" : o.status === "won" ? "Ganha" : "Perdida"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
