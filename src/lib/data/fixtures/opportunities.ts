import type { Opportunity } from "../types";
import { contacts } from "./contacts";

const sources = ["Facebook", "Instagram", "Indicação", "Checkout", "Demonstração CRM ON"];
const ownerIds = ["u-gustavo", "u-camila", "u-emille", "u-halyson", "u-lucas", "u-rhayan"];

// distribuição nas 9 fases do pipe-controle (~80 oportunidades)
const stageSpread: { stageId: string; count: number }[] = [
  { stageId: "st-novo", count: 18 },
  { stageId: "st-negociando", count: 14 },
  { stageId: "st-quente", count: 8 },
  { stageId: "st-teste", count: 6 },
  { stageId: "st-fim-teste", count: 3 },
  { stageId: "st-assinou", count: 12 },
  { stageId: "st-fila-demo", count: 4 },
  { stageId: "st-call-demo", count: 6 },
  { stageId: "st-perdido", count: 9 },
];

const values = [0, 97, 147, 197, 294];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

let seq = 0;
export const opportunities: Opportunity[] = stageSpread.flatMap(({ stageId, count }) =>
  Array.from({ length: count }, () => {
    const i = seq++;
    const contact = contacts[i % contacts.length];
    const status: Opportunity["status"] =
      stageId === "st-assinou" ? "won" : stageId === "st-perdido" ? "lost" : "open";
    return {
      id: `op-${i + 1}`,
      contactId: contact.id,
      pipelineId: "pipe-controle",
      stageId,
      name: `${contact.firstName} ${contact.lastName}`,
      source: sources[i % sources.length],
      value: values[i % values.length],
      ownerId: i % 4 === 3 ? undefined : ownerIds[i % ownerIds.length],
      status,
      createdAt: `2026-07-${pad((i % 28) + 1)}T10:${pad((i * 3) % 60)}:00-03:00`,
    };
  })
);
