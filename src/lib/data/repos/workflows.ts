"use client";

import { useCrmStore } from "../store";
import type { WorkflowNode } from "../types";

export function useWorkflows() {
  return useCrmStore((s) => s.workflows);
}

export function useWorkflow(id: string | null) {
  return useCrmStore((s) => (id ? s.workflows.find((w) => w.id === id) ?? null : null));
}

export const workflowActions = {
  create: (name: string, folder?: string) => useCrmStore.getState().addWorkflow(name, folder),
  setTrigger: (id: string, node: WorkflowNode) =>
    useCrmStore.getState().setWorkflowTrigger(id, node),
  addAction: (id: string, node: WorkflowNode) =>
    useCrmStore.getState().addWorkflowAction(id, node),
  removeNode: (workflowId: string, nodeId: string) =>
    useCrmStore.getState().removeWorkflowNode(workflowId, nodeId),
  toggleStatus: (id: string) => useCrmStore.getState().toggleWorkflowStatus(id),
};
