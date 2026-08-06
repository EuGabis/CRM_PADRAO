import type { Pipeline } from "../types";

export const pipelines: Pipeline[] = [
  {
    id: "pipe-controle",
    name: "✅ Controle de Leads",
    stages: [
      { id: "st-novo", name: "NOVO LEAD", color: "#94a3b8", order: 0 },
      { id: "st-negociando", name: "NEGOCIANDO", color: "#3b82f6", order: 1 },
      { id: "st-quente", name: "QUENTE 🔥", color: "#f43f5e", order: 2 },
      { id: "st-teste", name: "TESTE GRÁTIS", color: "#f59e0b", order: 3 },
      { id: "st-fim-teste", name: "FINALIZOU TESTE", color: "#ec4899", order: 4 },
      { id: "st-assinou", name: "ASSINOU", color: "#22c55e", order: 5 },
      { id: "st-fila-demo", name: "FILA DEMO", color: "#94a3b8", order: 6 },
      { id: "st-call-demo", name: "CALL DEMO", color: "#64748b", order: 7 },
      { id: "st-perdido", name: "PERDIDO", color: "#ef4444", order: 8 },
    ],
  },
  {
    id: "pipe-demo",
    name: "RHAYAN",
    stages: [
      { id: "st-d-fila", name: "FILA", color: "#94a3b8", order: 0 },
      { id: "st-d-feita", name: "FEITA / NEGOCIANDO", color: "#3b82f6", order: 1 },
      { id: "st-d-assinou", name: "ASSINOU", color: "#22c55e", order: 2 },
      { id: "st-d-perdido", name: "PERDIDO", color: "#ef4444", order: 3 },
    ],
  },
];
