"use client";

import { create } from "zustand";
import type {
  Appointment,
  Contact,
  Conversation,
  Message,
  Opportunity,
  Pipeline,
  User,
  Workflow,
  WorkflowNode,
} from "./types";
import { users } from "./fixtures/users";
import { contacts } from "./fixtures/contacts";
import { pipelines } from "./fixtures/pipelines";
import { opportunities } from "./fixtures/opportunities";
import { conversations, messages } from "./fixtures/conversations";
import { workflows } from "./fixtures/workflows";
import { appointments } from "./fixtures/appointments";

export interface CrmState {
  users: User[];
  contacts: Contact[];
  pipelines: Pipeline[];
  opportunities: Opportunity[];
  conversations: Conversation[];
  messages: Message[];
  workflows: Workflow[];
  appointments: Appointment[];
}

export interface CrmActions {
  moveOpportunity: (id: string, stageId: string) => void;
  addOpportunity: (o: Omit<Opportunity, "id" | "createdAt">) => void;
  sendMessage: (
    conversationId: string,
    msg: Omit<Message, "id" | "conversationId" | "at">
  ) => void;
  toggleStar: (conversationId: string) => void;
  markRead: (conversationId: string) => void;
  addContact: (
    c: Omit<Contact, "id" | "createdAt" | "lastActivityAt" | "lastActivityChannel">
  ) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  addTagToContacts: (ids: string[], tag: string) => void;
  removeTagFromContacts: (ids: string[], tag: string) => void;
  deleteContacts: (ids: string[]) => void;
  addWorkflow: (name: string, folder?: string) => string;
  setWorkflowTrigger: (id: string, node: WorkflowNode) => void;
  addWorkflowAction: (id: string, node: WorkflowNode) => void;
  removeWorkflowNode: (workflowId: string, nodeId: string) => void;
  toggleWorkflowStatus: (id: string) => void;
}

let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}-${idSeq++}`;

export const useCrmStore = create<CrmState & CrmActions>((set) => ({
  users,
  contacts,
  pipelines,
  opportunities,
  conversations,
  messages,
  workflows,
  appointments,

  moveOpportunity: (id, stageId) =>
    set((s) => ({
      opportunities: s.opportunities.map((o) =>
        o.id === id
          ? {
              ...o,
              stageId,
              status:
                stageId === "st-assinou" ? "won" : stageId === "st-perdido" ? "lost" : "open",
            }
          : o
      ),
    })),

  addOpportunity: (o) =>
    set((s) => ({
      opportunities: [
        ...s.opportunities,
        { ...o, id: nextId("op"), createdAt: new Date().toISOString() },
      ],
    })),

  sendMessage: (conversationId, msg) =>
    set((s) => {
      const at = new Date().toISOString();
      return {
        messages: [
          ...s.messages,
          { ...msg, id: nextId("msg"), conversationId, at },
        ],
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessageAt: at,
                lastMessagePreview: msg.internal
                  ? "Comentário interno"
                  : msg.scheduledFor
                    ? "Mensagem agendada"
                    : msg.body,
                slaDays: 0,
              }
            : c
        ),
      };
    }),

  toggleStar: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, starred: !c.starred } : c
      ),
    })),

  markRead: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  addContact: (c) =>
    set((s) => ({
      contacts: [
        {
          ...c,
          id: nextId("c"),
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          lastActivityChannel: "whatsapp",
        },
        ...s.contacts,
      ],
    })),

  updateContact: (id, patch) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  addTagToContacts: (ids, tag) =>
    set((s) => ({
      contacts: s.contacts.map((c) =>
        ids.includes(c.id) && !c.tags.includes(tag) ? { ...c, tags: [...c.tags, tag] } : c
      ),
    })),

  removeTagFromContacts: (ids, tag) =>
    set((s) => ({
      contacts: s.contacts.map((c) =>
        ids.includes(c.id) ? { ...c, tags: c.tags.filter((t) => t !== tag) } : c
      ),
    })),

  deleteContacts: (ids) =>
    set((s) => ({
      contacts: s.contacts.filter((c) => !ids.includes(c.id)),
    })),

  addWorkflow: (name, folder) => {
    const id = nextId("wf");
    set((s) => ({
      workflows: [
        {
          id,
          name,
          folder: folder ?? null,
          status: "draft",
          enrolledTotal: 0,
          enrolledActive: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          trigger: null,
          actions: [],
        },
        ...s.workflows,
      ],
    }));
    return id;
  },

  setWorkflowTrigger: (id, node) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, trigger: node, updatedAt: new Date().toISOString() } : w
      ),
    })),

  addWorkflowAction: (id, node) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id
          ? { ...w, actions: [...w.actions, node], updatedAt: new Date().toISOString() }
          : w
      ),
    })),

  removeWorkflowNode: (workflowId, nodeId) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              trigger: w.trigger?.id === nodeId ? null : w.trigger,
              actions: w.actions.filter((a) => a.id !== nodeId),
            }
          : w
      ),
    })),

  toggleWorkflowStatus: (id) =>
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === id ? { ...w, status: w.status === "published" ? "draft" : "published" } : w
      ),
    })),
}));
