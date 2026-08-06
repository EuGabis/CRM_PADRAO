import type { Channel, Conversation, Message } from "../types";
import { contacts } from "./contacts";

const channels: Channel[] = ["whatsapp", "instagram", "facebook", "sms", "email"];

const inbound = [
  "Oi, vi o anúncio de vocês e fiquei interessado",
  "Quanto custa o plano mensal?",
  "Consigo migrar meus contatos de outra plataforma?",
  "blz obrigado",
  "Pode me ligar amanhã às 10h?",
  "Vocês têm teste grátis?",
  "Beleza, combinado!",
  "Ainda tô avaliando com meu sócio",
];

const outbound = [
  "Olá! 👋 Que bom ter você por aqui. Como posso ajudar?",
  "Nosso plano começa em R$147/mês, com tudo ilimitado.",
  "Consegue sim! A importação é por CSV, te mando o passo a passo.",
  "Perfeito! Qualquer coisa é só chamar 😊",
  "Claro, agendado para amanhã às 10h!",
  "Temos 7 dias grátis, quer que eu ative agora?",
  "Fechado! Vou te enviar o link de assinatura.",
  "Sem problemas, fico à disposição!",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const slaSpread = [16, 12, 5, 0, 0, 2, 0, 1, 0, 3, 0, 0, 7, 0, 4, 0, 0, 9, 0, 1];

export const conversations: Conversation[] = Array.from({ length: 20 }, (_, i) => {
  const contact = contacts[i];
  return {
    id: `conv-${i + 1}`,
    contactId: contact.id,
    channel: channels[i % channels.length],
    unreadCount: i % 3 === 0 ? (i % 5) + 1 : 0,
    lastMessageAt: `2026-08-${pad((i % 6) + 1)}T${pad(9 + (i % 10))}:${pad((i * 11) % 60)}:00-03:00`,
    lastMessagePreview: i % 4 === 1 ? "Mensagem de áudio" : inbound[i % inbound.length],
    starred: i % 6 === 0,
    slaDays: slaSpread[i],
  };
});

export const messages: Message[] = conversations.flatMap((conv, ci) => {
  const base: Message[] = Array.from({ length: 6 }, (_, mi) => {
    const isIn = mi % 2 === 0;
    return {
      id: `msg-${conv.id}-${mi}`,
      conversationId: conv.id,
      direction: isIn ? "in" : "out",
      type: "text" as const,
      channel: conv.channel,
      body: isIn ? inbound[(ci + mi) % inbound.length] : outbound[(ci + mi) % outbound.length],
      at: `2026-08-${pad((ci % 6) + 1)}T${pad(9 + (mi % 8))}:${pad((mi * 9 + ci) % 60)}:00-03:00`,
    };
  });
  if (ci % 4 === 1) {
    base.push({
      id: `msg-${conv.id}-audio`,
      conversationId: conv.id,
      direction: "in",
      type: "audio",
      channel: conv.channel,
      body: "0:21",
      at: `2026-08-${pad((ci % 6) + 1)}T17:2${ci % 10}:00-03:00`,
    });
  }
  if (ci === 0 || ci === 5) {
    base.push({
      id: `msg-${conv.id}-event`,
      conversationId: conv.id,
      direction: "in",
      type: "event",
      channel: conv.channel,
      body: "Oportunidade movida de NEGOCIANDO → ASSINOU em ✅ Controle de Leads",
      at: `2026-08-${pad((ci % 6) + 1)}T18:00:00-03:00`,
    });
  }
  return base;
});
