/**
 * Normaliza um telefone para SÓ DÍGITOS — remove espaços, traços, parênteses,
 * "+", pontos, etc.
 *
 * NÃO mexe no número em si (código do país 55, 9º dígito de celular): isso
 * afeta a entrega no WhatsApp e o disparo, e está fora do escopo. O objetivo é
 * só que o mesmo número escrito em formatos diferentes ("55 11 97400-7817" vs
 * "5511974007817") vire a MESMA string, para a trava única
 * `contacts(location_id, phone)` (migração 0064) de fato barrar o duplicado.
 *
 * Ponto único usado por todas as entradas de contato digitadas/importadas
 * (cadastro e edição na tela, importação CSV, formulários públicos, sync da
 * Guru). O webhook do WhatsApp já recebe só dígitos do JID, então não passa
 * por aqui.
 */
export function normalizarTelefone(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/\D/g, "");
}
