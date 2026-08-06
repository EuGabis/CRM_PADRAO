"use client";

import { useMemo } from "react";
import { useCrmStore } from "../store";
import type { Opportunity } from "../types";

export function usePipelines() {
  return useCrmStore((s) => s.pipelines);
}

export function usePipeline(id: string) {
  return useCrmStore((s) => s.pipelines.find((p) => p.id === id) ?? null);
}

export function useOpportunities() {
  return useCrmStore((s) => s.opportunities);
}

export function useOpportunitiesByStage(pipelineId: string): Record<string, Opportunity[]> {
  const opportunities = useCrmStore((s) => s.opportunities);
  return useMemo(() => {
    const byStage: Record<string, Opportunity[]> = {};
    for (const o of opportunities) {
      if (o.pipelineId !== pipelineId) continue;
      (byStage[o.stageId] ??= []).push(o);
    }
    return byStage;
  }, [opportunities, pipelineId]);
}

export function useOpportunitiesByContact(contactId: string) {
  const opportunities = useCrmStore((s) => s.opportunities);
  return useMemo(
    () => opportunities.filter((o) => o.contactId === contactId),
    [opportunities, contactId]
  );
}

export function stageTotal(ops: Opportunity[] | undefined): number {
  return (ops ?? []).reduce((sum, o) => sum + o.value, 0);
}

export const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const opportunityActions = {
  move: (id: string, stageId: string) => useCrmStore.getState().moveOpportunity(id, stageId),
  add: (o: Omit<Opportunity, "id" | "createdAt">) => useCrmStore.getState().addOpportunity(o),
};
