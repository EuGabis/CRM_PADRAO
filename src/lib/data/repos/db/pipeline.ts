"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Opportunity, Pipeline, PipelineScope, Stage } from "@/lib/data/types";
import { useDbStore } from "./contacts";
import { logBulk } from "./contacts-module";

/* eslint-disable @typescript-eslint/no-explicit-any */

const mapStage = (r: any): Stage => ({
  id: r.id,
  name: r.name,
  color: r.color,
  order: r.position,
});

const mapOpportunity = (r: any): Opportunity => ({
  id: r.id,
  contactId: r.contact_id,
  pipelineId: r.pipeline_id,
  stageId: r.stage_id,
  name: r.name,
  source: r.source,
  value: Number(r.value),
  ownerId: r.owner_id ?? undefined,
  status: r.status,
  createdAt: r.created_at,
});

/** Deduz o status a partir do nome da fase (ganho/perda). */
function statusForStage(stage: Stage | undefined): Opportunity["status"] {
  const n = (stage?.name ?? "").toUpperCase();
  if (n.includes("PERDID")) return "lost";
  if (n.includes("ASSINOU") || n.includes("GANHO") || n.includes("GANHA")) return "won";
  return "open";
}

interface PipelineDbState {
  loaded: boolean;
  loading: boolean;
  pipelines: Pipeline[];
  opportunities: Opportunity[];
  load: () => Promise<void>;
  patch: (p: Partial<Pick<PipelineDbState, "pipelines" | "opportunities">>) => void;
}

export const usePipelineDbStore = create<PipelineDbState>((set, get) => ({
  loaded: false,
  loading: false,
  pipelines: [],
  opportunities: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    await useDbStore.getState().load();
    const supabase = createClient();
    const [pipes, stages, opps] = await Promise.all([
      supabase.from("pipelines").select("*").order("position").order("created_at"),
      supabase.from("stages").select("*").order("position"),
      supabase.from("opportunities").select("*").order("created_at", { ascending: false }),
    ]);
    const stagesByPipe = new Map<string, Stage[]>();
    (stages.data ?? []).forEach((r: any) => {
      const list = stagesByPipe.get(r.pipeline_id) ?? [];
      list.push(mapStage(r));
      stagesByPipe.set(r.pipeline_id, list);
    });
    set({
      loaded: true,
      loading: false,
      pipelines: (pipes.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        stages: stagesByPipe.get(p.id) ?? [],
        // Colunas da 0039. `?? "empresa"` cobre o intervalo entre subir o
        // código e aplicar a migração: sem elas, tudo é da empresa (que é
        // exatamente como era antes).
        scope: (p.scope ?? "empresa") as PipelineScope,
        departmentId: p.department_id ?? null,
        ownerId: p.owner_id ?? null,
      })),
      opportunities: (opps.data ?? []).map(mapOpportunity),
    });
  },

  patch: (p) => set(p),
}));

export function usePipelineDb() {
  const store = usePipelineDbStore();
  useEffect(() => {
    void store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return store;
}

const loc = () => useDbStore.getState().locationId;
const uid = () => useDbStore.getState().userId;
const state = () => usePipelineDbStore.getState();

/** Pipelines reais (carrega on-demand). */
export function useDbPipelines(): Pipeline[] {
  return usePipelineDb().pipelines;
}

/** Oportunidades reais (carrega on-demand). */
export function useDbOpportunities(): Opportunity[] {
  return usePipelineDb().opportunities;
}

/** Resolve um pipeline por id; ""/"all"/id inexistente caem no primeiro. */
export function useDbPipeline(id: string): Pipeline | null {
  const { pipelines } = usePipelineDb();
  if (id && id !== "all") {
    const found = pipelines.find((p) => p.id === id);
    if (found) return found;
  }
  return pipelines[0] ?? null;
}

/**
 * Registra na conversa do contato que o card foi movido a mão — a contraparte
 * humana do evento que `registrarAtendimento` (oportunidade-ia.ts) grava para
 * a IA. Mesmo formato de insert (`direction: "out"`, `type: "event"`); aqui a
 * query roda com a sessão do usuário (RLS), não service role.
 *
 * Se o contato não tem conversa nenhuma, não registra — e não cria: um
 * arrastar de card não pode encher a inbox de conversas vazias. Best-effort,
 * nunca lança: falha ao registrar o evento não pode impedir a movimentação,
 * que já aconteceu.
 */
async function registrarEventoMovimentacao(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  origem: string,
  destino: string
): Promise<void> {
  const location = loc();
  if (!location) return;
  try {
    const { data: conversa } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!conversa) return; // sem conversa ligada — não cria uma só para o evento

    let nome: string | null = null;
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", auth.user.id)
        .maybeSingle();
      nome = perfil?.name ?? null;
    }
    const body = nome
      ? `Oportunidade movida de ${origem} → ${destino} por ${nome}`
      : `Oportunidade movida de ${origem} → ${destino}`;
    await supabase.from("messages").insert({
      location_id: location,
      conversation_id: conversa.id,
      direction: "out",
      type: "event",
      channel: "whatsapp",
      body,
    });
  } catch (err) {
    logFalhaEvento(err);
  }
}

/**
 * Versão em lote de `registrarEventoMovimentacao`, usada pelo `moveMany`
 * (arrastar vários cards de uma vez no kanban). Mesmas duas regras da
 * versão única: card cuja oportunidade não tem conversa correspondente
 * não registra e não cria conversa; falha ao gravar é best-effort e não
 * pode derrubar a movimentação, que já aconteceu.
 *
 * Um único select (conversa mais recente por contato, calculada aqui) e
 * um único insert em lote — nunca um insert por card, senão 30 cards
 * arrastados de uma vez travariam a tela em 30 round-trips sequenciais.
 */
async function registrarEventosMovimentacaoLote(
  supabase: ReturnType<typeof createClient>,
  itens: { contactId: string; origem: string; destino: string }[]
): Promise<void> {
  const location = loc();
  if (!location || itens.length === 0) return;
  try {
    const contactIds = itens.map((i) => i.contactId);
    const { data: conversas } = await supabase
      .from("conversations")
      .select("id, contact_id, last_message_at")
      .in("contact_id", contactIds);
    if (!conversas || conversas.length === 0) return;

    // Conversa mais recente por contato — mesmo critério de desempate da
    // versão única (`order by last_message_at desc limit 1`), aqui
    // calculado em memória porque cobre vários contatos de uma vez.
    const porContato = new Map<string, { id: string; lastMessageAt: string }>();
    for (const c of conversas as { id: string; contact_id: string; last_message_at: string | null }[]) {
      const atual = porContato.get(c.contact_id);
      const chave = c.last_message_at ?? "";
      if (!atual || chave > atual.lastMessageAt) {
        porContato.set(c.contact_id, { id: c.id, lastMessageAt: chave });
      }
    }

    let nome: string | null = null;
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", auth.user.id)
        .maybeSingle();
      nome = perfil?.name ?? null;
    }

    const rows = itens
      .map((item) => {
        const conversa = porContato.get(item.contactId);
        if (!conversa) return null; // sem conversa ligada — não cria uma só para o evento
        const body = nome
          ? `Oportunidade movida de ${item.origem} → ${item.destino} por ${nome}`
          : `Oportunidade movida de ${item.origem} → ${item.destino}`;
        return {
          location_id: location,
          conversation_id: conversa.id,
          direction: "out" as const,
          type: "event" as const,
          channel: "whatsapp" as const,
          body,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) return;

    await supabase.from("messages").insert(rows);
  } catch (err) {
    logFalhaEvento(err);
  }
}

/**
 * Só o código do erro do Postgres, nunca o objeto inteiro ou a mensagem —
 * a mensagem de erro do Postgres ecoa o valor ofensor, que aqui pode ser
 * texto de conversa do cliente. Mesmo padrão de `oportunidade-ia.ts`.
 */
function logFalhaEvento(err: unknown): void {
  const code = (err as { code?: string } | null | undefined)?.code;
  console.error("[pipeline] falha ao registrar evento de movimentação na conversa", { code });
}

export const oppActions = {
  async move(id: string, stageId: string): Promise<boolean> {
    const s = state();
    const opp = s.opportunities.find((o) => o.id === id);
    const allStages = s.pipelines.flatMap((p) => p.stages);
    const origem = allStages.find((st) => st.id === opp?.stageId);
    const stage = allStages.find((st) => st.id === stageId);
    const status = statusForStage(stage);
    const supabase = createClient();
    const { error } = await supabase
      .from("opportunities")
      .update({ stage_id: stageId, status })
      .eq("id", id);
    if (error) return false;
    s.patch({
      opportunities: s.opportunities.map((o) => (o.id === id ? { ...o, stageId, status } : o)),
    });
    if (opp && origem && stage && origem.id !== stage.id) {
      void registrarEventoMovimentacao(supabase, opp.contactId, origem.name, stage.name);
    }
    return true;
  },

  async moveMany(ids: string[], stageId: string): Promise<boolean> {
    const s = state();
    const allStages = s.pipelines.flatMap((p) => p.stages);
    const stage = allStages.find((st) => st.id === stageId);
    const status = statusForStage(stage);
    // Capturado ANTES do patch: precisamos da fase de origem de cada card
    // para o texto do evento, e `s.opportunities` muda de referência no
    // patch logo abaixo.
    const opsAntes = s.opportunities.filter((o) => ids.includes(o.id));
    const supabase = createClient();
    const { error } = await supabase
      .from("opportunities")
      .update({ stage_id: stageId, status })
      .in("id", ids);
    if (error) return false;
    s.patch({
      opportunities: s.opportunities.map((o) =>
        ids.includes(o.id) ? { ...o, stageId, status } : o
      ),
    });
    void logBulk(`Mover ${ids.length} lead(s) para "${stage?.name ?? "fase"}"`, ids.length);
    if (stage) {
      const itens = opsAntes
        .map((o) => {
          const origem = allStages.find((st) => st.id === o.stageId);
          if (!origem || origem.id === stage.id) return null;
          return { contactId: o.contactId, origem: origem.name, destino: stage.name };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (itens.length > 0) void registrarEventosMovimentacaoLote(supabase, itens);
    }
    return true;
  },

  async add(input: {
    contactId: string;
    contactName: string;
    pipelineId: string;
    stageId: string;
    value: number;
    source: string;
  }): Promise<boolean> {
    const location = loc();
    if (!location) return false;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("opportunities")
      .insert({
        location_id: location,
        contact_id: input.contactId,
        pipeline_id: input.pipelineId,
        stage_id: input.stageId,
        name: input.contactName,
        source: input.source,
        value: input.value,
        owner_id: uid(),
      })
      .select()
      .single();
    if (error || !data) return false;
    const s = state();
    s.patch({ opportunities: [mapOpportunity(data), ...s.opportunities] });
    return true;
  },

  async remove(ids: string[]): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("opportunities").delete().in("id", ids);
    if (error) return false;
    const s = state();
    s.patch({ opportunities: s.opportunities.filter((o) => !ids.includes(o.id)) });
    if (ids.length > 1) void logBulk("Excluir oportunidades", ids.length);
    return true;
  },
};

export const pipelineActions = {
  /**
   * Cria um pipeline com escopo (0039). Usuário comum só consegue criar
   * `scope: "user"` com ele mesmo de dono — a RLS recusa o resto, então aqui
   * não há checagem duplicada de papel: quem manda é o banco.
   */
  async addPipeline(
    name: string,
    visibility: { scope: PipelineScope; departmentId?: string | null; ownerId?: string | null } = {
      scope: "user",
    }
  ): Promise<boolean> {
    const location = loc();
    if (!location) return false;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pipelines")
      .insert({
        location_id: location,
        name,
        position: state().pipelines.length,
        scope: visibility.scope,
        department_id: visibility.scope === "department" ? visibility.departmentId : null,
        owner_id:
          visibility.scope === "user" ? (visibility.ownerId ?? uid()) : null,
        created_by: uid(),
      })
      .select()
      .single();
    if (error || !data) return false;
    const s = state();
    s.patch({
      pipelines: [
        ...s.pipelines,
        {
          id: data.id,
          name: data.name,
          stages: [],
          scope: data.scope ?? "empresa",
          departmentId: data.department_id ?? null,
          ownerId: data.owner_id ?? null,
        },
      ],
    });
    return true;
  },

  /** Troca o escopo (só admin — a RLS recusa para os demais). */
  async setPipelineScope(
    id: string,
    visibility: { scope: PipelineScope; departmentId?: string | null; ownerId?: string | null }
  ): Promise<boolean> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pipelines")
      .update({
        scope: visibility.scope,
        department_id: visibility.scope === "department" ? visibility.departmentId : null,
        owner_id: visibility.scope === "user" ? visibility.ownerId : null,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    // `data` nulo sem erro = RLS recusou. Sem checar, a tela diria "salvo".
    if (error || !data) return false;
    const s = state();
    s.patch({
      pipelines: s.pipelines.map((p) =>
        p.id === id
          ? {
              ...p,
              scope: data.scope,
              departmentId: data.department_id ?? null,
              ownerId: data.owner_id ?? null,
            }
          : p
      ),
    });
    return true;
  },

  async renamePipeline(id: string, name: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("pipelines").update({ name }).eq("id", id);
    if (error) return false;
    const s = state();
    s.patch({ pipelines: s.pipelines.map((p) => (p.id === id ? { ...p, name } : p)) });
    return true;
  },

  async removePipeline(id: string): Promise<"ok" | "has-opps" | "error"> {
    const s = state();
    if (s.opportunities.some((o) => o.pipelineId === id)) return "has-opps";
    const supabase = createClient();
    const { error } = await supabase.from("pipelines").delete().eq("id", id);
    if (error) return "error";
    s.patch({ pipelines: s.pipelines.filter((p) => p.id !== id) });
    return "ok";
  },

  async addStage(pipelineId: string, name: string, color: string): Promise<boolean> {
    const location = loc();
    if (!location) return false;
    const s = state();
    const pipe = s.pipelines.find((p) => p.id === pipelineId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stages")
      .insert({
        location_id: location,
        pipeline_id: pipelineId,
        name,
        color,
        position: pipe?.stages.length ?? 0,
      })
      .select()
      .single();
    if (error || !data) return false;
    s.patch({
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId ? { ...p, stages: [...p.stages, mapStage(data)] } : p
      ),
    });
    return true;
  },

  async renameStage(id: string, name: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("stages").update({ name }).eq("id", id);
    if (error) return false;
    const s = state();
    s.patch({
      pipelines: s.pipelines.map((p) => ({
        ...p,
        stages: p.stages.map((st) => (st.id === id ? { ...st, name } : st)),
      })),
    });
    return true;
  },

  async removeStage(id: string): Promise<"ok" | "has-opps" | "error"> {
    const s = state();
    if (s.opportunities.some((o) => o.stageId === id)) return "has-opps";
    const supabase = createClient();
    const { error } = await supabase.from("stages").delete().eq("id", id);
    if (error) return "error";
    s.patch({
      pipelines: s.pipelines.map((p) => ({
        ...p,
        stages: p.stages.filter((st) => st.id !== id),
      })),
    });
    return "ok";
  },
};
