export const brand = {
  name: "CRM ON",
  shortName: "ON",
  tagline: "Seu negócio inteiro em um lugar",
} as const;

/**
 * Marca usada nos E-MAILS (remetente, cabeçalho das campanhas e rodapé). É separada
 * da marca do app: os e-mails falam com o cliente final em nome da empresa.
 * `address`: endereço postal no rodapé — exigido por leis anti-spam (CAN-SPAM) e melhora
 * a entregabilidade. EDITE com o endereço real da empresa.
 */
export const emailBrand = {
  name: brand.name,
  shortName: brand.shortName,
  /**
   * PREENCHA com o endereço postal real da empresa antes de disparar campanha.
   * Vazio por enquanto: um endereço inventado é pior que nenhum, e o rodapé
   * simplesmente não mostra a linha quando está em branco.
   */
  address: "",
} as const;
