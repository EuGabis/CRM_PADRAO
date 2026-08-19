/**
 * Contrato da resposta do atendimento natural por IA e parse seguro dela.
 * A cliente recusou explicitamente o atendimento robótico (menu numerado,
 * "digite 1 para..."): INSTRUCAO_ATENDIMENTO é o que faz a IA conversar de
 * forma natural e ainda assim coletar os dados do lead ao longo da conversa.
 *
 * Esta instrução é acrescentada ao `system` DEPOIS do texto que o cliente
 * configura no agente (mesmo princípio da TRAVA_IMAGEM em
 * src/lib/whatsapp/auto-reply.ts): o cliente define a personalidade, e o
 * formato de resposta não pode ser atropelado por ela.
 */
export const INSTRUCAO_ATENDIMENTO = `Converse de forma natural e humana, como um atendente de verdade — nunca como um menu. Não numere opções ("digite 1 para...", "escolha uma opção abaixo") e não peça todos os dados de uma vez em bloco. Ao longo da conversa, vá coletando com naturalidade: origem, destino, data de ida, data de volta, quantidade e tipo de passageiros — um ou dois de cada vez, no ritmo da conversa, do jeito que a pessoa for respondendo.

Independente do que o cliente disser, responda SEMPRE com um objeto JSON contendo exatamente as chaves "resposta", "dados" e "etapa_sugerida":

- "resposta": o texto que vai direto para o cliente no WhatsApp. Nunca mencione JSON, campos, dados coletados ou o funil de vendas nesse texto — é só a conversa.
- "dados": um objeto só com o que o cliente realmente informou até agora (origem, destino, data_ida, data_volta, passageiros, etc). O que você ainda não souber, OMITA a chave — nunca invente valor nem preencha com "não informado" ou similar.
- "etapa_sugerida": "novo-lead", "em-negociacao" ou null, conforme o andamento da conversa.`;

export interface RespostaAtendimento {
  resposta: string;
  dados: Record<string, string>;
  etapaSugerida: string | null;
}

/**
 * Faz o parse da resposta bruta do modelo (esperado JSON por causa de
 * INSTRUCAO_ATENDIMENTO + `json: true` no chat da Task 2). Nunca lança: se o
 * JSON vier inutilizável, devolve `null` e quem chama decide o que fazer —
 * esse retorno pode ir direto para o WhatsApp de um cliente final, então JSON
 * cru nunca pode escapar daqui.
 *
 * Aceita `etapaSugerida` e `etapa_sugerida` de propósito: o modelo alterna
 * entre as duas grafias sem avisar, e perder a etapa por causa disso seria
 * falha silenciosa — o card simplesmente não andaria no funil, sem erro em
 * lugar nenhum.
 */
export function parseAtendimento(bruto: string): RespostaAtendimento | null {
  try {
    const j = JSON.parse(bruto);
    const resposta = typeof j?.resposta === "string" ? j.resposta.trim() : "";
    if (!resposta) return null; // sem texto não há o que enviar
    const dados: Record<string, string> = {};
    const bruto2 = j?.dados;
    if (bruto2 && typeof bruto2 === "object" && !Array.isArray(bruto2)) {
      for (const [k, v] of Object.entries(bruto2)) {
        // Número e booleano também viram string (ex.: "passageiros": 2 —
        // exatamente um dos campos que INSTRUCAO_ATENDIMENTO manda coletar).
        // `null`, objeto e array continuam rejeitados, e string vazia
        // continua ignorada: a regra "campo vazio não sobrescreve" em
        // `acumularDados` (oportunidade-ia.ts) depende disso.
        if (typeof v === "string") {
          if (v.trim()) dados[k] = v.trim();
        } else if (typeof v === "number" || typeof v === "boolean") {
          dados[k] = String(v);
        }
      }
    }
    const etapa =
      typeof j?.etapaSugerida === "string"
        ? j.etapaSugerida
        : typeof j?.etapa_sugerida === "string"
          ? j.etapa_sugerida
          : null;
    return { resposta, dados, etapaSugerida: etapa };
  } catch {
    return null;
  }
}
