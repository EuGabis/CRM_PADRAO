/**
 * Remetente dos e-mails transacionais, vindo de `EMAIL_FROM`.
 *
 * Ignora o remetente de teste do Resend (`@resend.dev`): ele só entrega ao dono
 * da conta, então em produção o e-mail some sem erro visível.
 *
 * Devolve `null` quando não há remetente utilizável — e NÃO tem domínio de
 * fallback embutido de propósito. Um fallback fixo faria o CRM enviar em nome
 * de um domínio que talvez não seja seu: o Resend recusa (domínio não
 * verificado na sua conta) ou, pior, o e-mail sai com uma identidade errada.
 * Configure `EMAIL_FROM` com um endereço do seu domínio verificado no Resend.
 */
export function senderAddress(): string | null {
  const configured = process.env.EMAIL_FROM?.trim();
  if (!configured || /@resend\.dev>?/i.test(configured)) return null;
  return configured;
}

/**
 * Endereço de resposta (Reply-To) dos e-mails transacionais. Não precisa ser do
 * domínio verificado — é só para onde vão as respostas. Deixar de ser "no-reply
 * puro" ajuda a reputação/entregabilidade. Retorna null se EMAIL_REPLY_TO não estiver
 * definido (aí o e-mail sai sem Reply-To).
 */
export function replyToAddress(): string | null {
  const v = process.env.EMAIL_REPLY_TO?.trim();
  return v && v.includes("@") ? v : null;
}
