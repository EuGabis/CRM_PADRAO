"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { SubNav } from "@/components/layout/subnav";
import { EmptyState } from "@/components/shared/empty-state";
import { Composer } from "@/components/inbox/composer";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { ConversationList } from "@/components/inbox/conversation-list";
import { Thread } from "@/components/inbox/thread";
import { ViewsRail } from "@/components/inbox/views-rail";
import { useConversation, useConversations } from "@/lib/data/repos/conversations";

const TABS = [
  { label: "Conversas" },
  { label: "Ações manuais" },
  { label: "Trechos" },
  { label: "Links de acionamento" },
  { label: "Estatísticas" },
  { label: "Configurações" },
];

export default function ConversasPage() {
  const [tab, setTab] = useState("Conversas");
  const conversations = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const selectedConversation = useConversation(selectedId);

  return (
    <div className="flex h-full flex-col">
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      {tab !== "Conversas" ? (
        <div className="p-6">
          <EmptyState
            icon={MessageSquare}
            title={`${tab} — em construção`}
            description="Esta sub-aba de Conversas será aprofundada nas próximas etapas."
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ViewsRail />
          <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Thread conversationId={selectedId} />
              <Composer conversationId={selectedId} />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-slate-50">
              <p className="text-sm text-slate-400">Selecione uma conversa</p>
            </div>
          )}
          {selectedConversation && <ContactPanel contactId={selectedConversation.contactId} />}
        </div>
      )}
    </div>
  );
}
