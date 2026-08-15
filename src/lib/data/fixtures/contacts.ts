import type { Channel, Contact } from "../types";

const firstNames = [
  "Maurício", "Shirlei", "Diego", "Thiago", "Ana", "Bruno", "Carla", "Daniel",
  "Eduarda", "Felipe", "Gabriela", "Hugo", "Isabela", "João", "Karen", "Leandro",
  "Mariana", "Nicolas", "Olívia", "Paulo", "Quésia", "Rafael", "Sabrina", "Tiago",
  "Úrsula", "Vinícius", "Wesley", "Ximena", "Yasmin", "Zeca", "Adriana", "Bernardo",
  "Cristiane", "Douglas", "Elaine", "Fábio", "Giovana", "Henrique", "Ingrid", "Júlio",
  "Kelly", "Luana", "Marcelo", "Natália", "Otávio", "Patrícia", "Renato", "Simone",
  "Tatiane", "Valter",
];

const lastNames = [
  "Magalhães", "Quintino", "Moura", "Silva", "Souza", "Oliveira", "Santos", "Pereira",
  "Costa", "Almeida", "Nascimento", "Lima", "Araújo", "Fernandes", "Carvalho", "Gomes",
  "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Barbosa", "Cardoso", "Teixeira",
  "Correia",
];

const companies = [
  "Linx Consultoria", "Bella Estética", "AutoPeças Rio", "Clínica Vida", "Imobiliária Sol",
  "Agência Pulso", "Academia Forte", "Doce Sabor", "TechNova", "Petshop Amigo",
];

const tagPool = [["assinante"], ["negociando"], ["quente"], ["assinante", "vip"], ["negociando", "follow-up"], []];
const channels: Channel[] = ["whatsapp", "instagram", "facebook", "sms", "email"];
const ownerIds = ["u-gustavo", "u-camila", "u-emille", "u-halyson", "u-lucas", "u-rhayan"];
const sources = ["Facebook", "Instagram", "Indicação", "Checkout", "Quiz CRM ON - Teste Grátis"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const contacts: Contact[] = Array.from({ length: 50 }, (_, i) => {
  const firstName = firstNames[i % firstNames.length];
  const lastName = lastNames[i % lastNames.length];
  const createdDay = (i % 28) + 1;
  const activityHour = 8 + (i % 11);
  return {
    id: `c-${i + 1}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${lastName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")}@exemplo.com.br`,
    phone: `+55 21 9${pad(80 + (i % 20))}${pad(10 + i)}-${pad(20 + i)}${pad(i % 100)}`.slice(0, 19),
    company: i % 3 === 0 ? companies[i % companies.length] : undefined,
    tags: tagPool[i % tagPool.length],
    ownerId: ownerIds[i % ownerIds.length],
    createdAt: `2026-07-${pad(createdDay)}T${pad(activityHour)}:0${i % 6}:00-03:00`,
    lastActivityAt: `2026-08-${pad((i % 5) + 1)}T${pad(activityHour)}:${pad((i * 7) % 60)}:00-03:00`,
    lastActivityChannel: channels[i % channels.length],
    dnd: i % 17 === 0,
    customFields: {
      "Tipo de Negócio": companies[i % companies.length].split(" ")[0],
      "Interesse com CRM": ["Organizar leads", "Automação", "Atendimento"][i % 3],
      "Fonte UTM": sources[i % sources.length],
      utm_campaign: ["ad-parceria", "consultoria-gratuita", "teste-gratis"][i % 3],
    },
  };
});
