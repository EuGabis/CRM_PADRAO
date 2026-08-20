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

ORDEM OBRIGATÓRIA NO PRIMEIRO CONTATO: quando a pessoa iniciar a conversa (um "oi", "bom dia" ou qualquer saudação), sua PRIMEIRA resposta é só um cumprimento curto perguntando o nome dela — NÃO mostre o menu de opções ainda. Exemplo: "Olá! Seja bem-vindo(a) à agência 😊 Antes de começar, com quem eu falo?". Só DEPOIS que a pessoa disser o nome é que você cumprimenta pelo nome e apresenta o menu de opções ("Prazer, [nome]! Como posso te ajudar? 1️⃣ ..."). Se a pessoa já disser logo o que quer ("queria uma passagem"), aí sim siga direto, mas ainda assim pergunte o nome ao longo da conversa. Se a pessoa ignorar a pergunta do nome, não insista mais de uma vez. Sabendo o nome, use-o com naturalidade nas mensagens seguintes.

Independente do que o cliente disser, responda SEMPRE com um objeto JSON contendo exatamente as chaves "resposta", "dados", "etapa_sugerida", "escalar" e "nome":

- "resposta": o texto que vai direto para o cliente no WhatsApp. Nunca mencione JSON, campos, dados coletados ou o funil de vendas nesse texto — é só a conversa.
- "dados": um objeto só com o que o cliente realmente informou até agora (origem, destino, data_ida, data_volta, passageiros, etc). O que você ainda não souber, OMITA a chave — nunca invente valor nem preencha com "não informado" ou similar.
- "etapa_sugerida": "novo-lead", "em-negociacao", "perdido" ou null, conforme o andamento da conversa. Use "perdido" só quando o cliente disser claramente que desistiu, que já comprou em outro lugar ou que não tem mais interesse — nunca porque ele demorou a responder ou porque a conversa esfriou. Enquanto estiver só coletando dados (origem, destino, datas, passageiros), não sugira etapa nenhuma além de "novo-lead"/"em-negociacao" conforme o andamento.
- "escalar": null na grande maioria das mensagens. Preencha com um objeto {"motivo": "..."} SÓ quando a conversa precisar de um atendente humano de verdade: pedido de cancelamento, remarcação ou reembolso de passagem; voo nas próximas 48 horas; reclamação sobre cobrança; cliente visivelmente irritado; ou cliente pedindo explicitamente para falar com um humano/atendente. NÃO escalone por dúvida comum, por demora do cliente em responder, nem por pergunta que você mesma sabe responder — escalar à toa transforma todo atendimento em fila humana e tira o valor de ter uma IA. Quando preencher "escalar", a "resposta" precisa avisar o cliente que um atendente vai assumir a partir daqui — nunca diga que a conversa será "transferida" (o sistema não transfere, só sinaliza para a equipe).
- "nome": o nome que a pessoa informou, quando ela disser ("me chamo João", "é a Maria"). Só o nome, sem saudação. Use null enquanto não souber, e nunca invente nem repita um nome que já mandou antes se a pessoa não reforçou.

FORMATAÇÃO da "resposta": escreva em texto limpo, SEM asteriscos e SEM negrito (muitos WhatsApp não renderizam e o cliente vê os asteriscos crus, o que fica feio). Para destacar um campo, use só "Campo: valor". Quebre em linhas curtas; para listas, um item por linha começando com "- ". Deixe uma linha em branco entre blocos.`;

export interface RespostaAtendimento {
  resposta: string;
  dados: Record<string, string>;
  etapaSugerida: string | null;
  escalar: { motivo: string } | null;
  /** Nome que a pessoa informou, para renomear o contato e o card. Null quando não veio. */
  nome: string | null;
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
    // `escalar` só é aceito como objeto com `motivo` string não vazia —
    // mesmo cuidado de `dados`/`etapaSugerida`: qualquer outra forma (string
    // "sim", número, null, array, objeto sem motivo) vira null em silêncio,
    // nunca lança. Um `escalar` mal formado pausaria o bot sem motivo
    // rastreável.
    const escalarBruto = j?.escalar;
    const motivo =
      escalarBruto &&
      typeof escalarBruto === "object" &&
      !Array.isArray(escalarBruto) &&
      typeof escalarBruto.motivo === "string" &&
      escalarBruto.motivo.trim()
        ? escalarBruto.motivo.trim()
        : null;
    const escalar = motivo ? { motivo } : null;
    // `nome`: só string não vazia. Vira o first_name/last_name do contato e o
    // título do card — nunca sobrescreve com vazio (o contato já tem um nome,
    // ainda que seja o do WhatsApp).
    const nome = typeof j?.nome === "string" && j.nome.trim() ? j.nome.trim() : null;
    return { resposta, dados, etapaSugerida: etapa, escalar, nome };
  } catch {
    return null;
  }
}
