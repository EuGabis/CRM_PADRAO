"use client";

import { useMemo } from "react";
import { useCrmStore } from "../store";
import type { Message } from "../types";

export type ConversationFilter = "unread" | "all" | "recent" | "starred";

export function useConversations(filter: ConversationFilter = "all") {
  const conversations = useCrmStore((s) => s.conversations);
  return useMemo(() => {
    let list = [...conversations];
    if (filter === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (filter === "starred") list = list.filter((c) => c.starred);
    list.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    if (filter === "recent") list = list.slice(0, 8);
    return list;
  }, [conversations, filter]);
}

export function useConversation(id: string | null) {
  return useCrmStore((s) => (id ? s.conversations.find((c) => c.id === id) ?? null : null));
}

export function useMessages(conversationId: string | null) {
  const messages = useCrmStore((s) => s.messages);
  return useMemo(
    () =>
      conversationId
        ? messages
            .filter((m) => m.conversationId === conversationId)
            .sort((a, b) => a.at.localeCompare(b.at))
        : [],
    [messages, conversationId]
  );
}

export const conversationActions = {
  send: (conversationId: string, msg: Omit<Message, "id" | "conversationId" | "at">) =>
    useCrmStore.getState().sendMessage(conversationId, msg),
  star: (conversationId: string) => useCrmStore.getState().toggleStar(conversationId),
  markRead: (conversationId: string) => useCrmStore.getState().markRead(conversationId),
};
