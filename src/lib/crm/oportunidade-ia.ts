/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * O que a IA pode fazer no funil. Esta lista é a garantia — pedir ao modelo
 * "não mova para Ganho" no prompt é um pedido, não uma regra: basta uma
 * conversa criativa para ele desobedecer.
 *
 * Ganho e Perdido são resultado de negócio, não estado de conversa. "pode
 * fechar então!" não é uma venda: o cliente não pagou nem emitiu. Se a
 * interpretação do modelo virasse número de venda, o relatório da agência
 * viraria ficção.
 */
const ETAPAS_DA_IA: Record<string, string> = {
  "novo-lead": "Novo Lead",
  "em-negociacao": "Em Negociação",
};

/** Nomes de etapa que a IA tem permissão de tocar — usado para saber se um
 * card ainda está no "território" dela (ver `sincronizarOportunidade`). */
const NOMES_DA_IA = new Set(Object.values(ETAPAS_DA_IA));

interface RegistrarAtendimentoParams {
  locationId: string;
  conversationId: string;
  contactId: string;
  dados: Record<string, string>;
  etapaSugerida: string | null;
}

/**
 * Aplica o que a IA extraiu de uma mensagem: acumula os dados coletados no
 * contato e, se a etapa sugerida estiver na allowlist, cria ou move a
 * oportunidade da conversa — sempre registrando o evento correspondente na
 * conversa.
 *
 * Best-effort: **nunca lança**. `db` é o cliente service role (roda pelo
 * webhook, sem sessão de usuário). Falha vai para `console.error` com
 * `location_id` e `code` — nunca o conteúdo da conversa nem dados do cliente
 * final.
 */
export async function registrarAtendimento(
  db: any,
  p: RegistrarAtendimentoParams
): Promise<void> {
  let contato: {
    first_name: string;
    last_name: string;
    custom_fields: Record<string, string> | null;
  } | null = null;

  try {
    const { data, error } = await db
      .from("contacts")
      .select("first_name, last_name, custom_fields")
      .eq("id", p.contactId)
      .eq("location_id", p.locationId)
      .maybeSingle();
    if (error) throw error;
    contato = data;
  } catch (err) {
    logFalha(p.locationId, err);
    return;
  }
  if (!contato) return;

  try {
    await acumularDados(db, p.contactId, p.locationId, contato.custom_fields ?? {}, p.dados);
  } catch (err) {
    logFalha(p.locationId, err);
  }

  try {
    const nomeContato = `${contato.first_name} ${contato.last_name}`.trim() || "Contato";
    await sincronizarOportunidade(db, p, nomeContato);
  } catch (err) {
    logFalha(p.locationId, err);
  }
}

function logFalha(locationId: string, err: unknown): void {
  const code = (err as { code?: string } | null | undefined)?.code;
  console.error("[registrarAtendimento] falha ao registrar atendimento no funil", {
    locationId,
    code,
  });
}

/**
 * Mescla os dados extraídos pela IA no `custom_fields` do contato.
 *
 * Campo vazio nunca sobrescreve valor já preenchido: o cliente informa aos
 * poucos (origem numa mensagem, data três mensagens depois), e a IA pode não
 * repetir o que já sabe. Um valor novo e não vazio sempre atualiza.
 */
async function acumularDados(
  db: any,
  contactId: string,
  locationId: string,
  atual: Record<string, string>,
  dados: Record<string, string>
): Promise<void> {
  const mesclado = { ...atual };
  let mudou = false;
  for (const [chave, valor] of Object.entries(dados)) {
    if (typeof valor !== "string" || valor.trim() === "") continue;
    if (mesclado[chave] === valor) continue;
    mesclado[chave] = valor;
    mudou = true;
  }
  if (!mudou) return;

  const { error } = await db
    .from("contacts")
    .update({ custom_fields: mesclado })
    .eq("id", contactId)
    .eq("location_id", locationId);
  if (error) throw error;
}

/**
 * Cria ou move a oportunidade da conversa, dentro do pipeline da empresa
 * (`scope = 'empresa'`), e grava o evento correspondente.
 *
 * Etapa fora da allowlist, ou sem etapa sugerida nesta rodada, não faz nada
 * aqui — a oportunidade só nasce quando a primeira etapa permitida chega.
 * Etapa desconhecida no funil da empresa (empresa nascida pelo cadastro
 * público, com o funil antigo) também não faz nada: nunca cria etapa nova,
 * só registra e segue.
 *
 * A allowlist restringe o destino, não a origem: um card que já saiu do
 * território da IA (etapa fora de `ETAPAS_DA_IA` — humano avançou na mão, ou
 * é um card manual em outra etapa qualquer) não é mais tocado por ela. E
 * dentro do território ela só avança (`stages.position` maior), nunca
 * retrocede um card que já foi movido para a frente — sem isso vira
 * ping-pong entre o humano e a IA a cada mensagem.
 */
async function sincronizarOportunidade(
  db: any,
  p: RegistrarAtendimentoParams,
  nomeContato: string
): Promise<void> {
  if (!p.etapaSugerida || !Object.hasOwn(ETAPAS_DA_IA, p.etapaSugerida)) {
    if (p.etapaSugerida) {
      console.info("[registrarAtendimento] etapa sugerida fora da allowlist, ignorada", {
        locationId: p.locationId,
      });
    }
    return;
  }
  const nomeEtapa = ETAPAS_DA_IA[p.etapaSugerida];

  const { data: pipeline, error: pipelineError } = await db
    .from("pipelines")
    .select("id")
    .eq("location_id", p.locationId)
    .eq("scope", "empresa")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pipelineError) throw pipelineError;
  if (!pipeline) {
    console.info("[registrarAtendimento] pipeline da empresa nao encontrado", {
      locationId: p.locationId,
    });
    return;
  }

  // `.order().limit(1)` em vez de `.maybeSingle()`: se o dono duplicar o nome
  // de uma etapa, `.maybeSingle()` recebe duas linhas e lança (`PGRST116`),
  // parando a sincronização em silêncio a cada mensagem. Pega a primeira e
  // segue.
  const { data: etapasAlvo, error: etapaError } = await db
    .from("stages")
    .select("id, name, position")
    .eq("location_id", p.locationId)
    .eq("pipeline_id", pipeline.id)
    .eq("name", nomeEtapa)
    .order("position", { ascending: true })
    .limit(1);
  if (etapaError) throw etapaError;
  const etapa = etapasAlvo?.[0] ?? null;
  if (!etapa) {
    // Divergência conhecida (AGENTS.md): empresa criada pelo cadastro público
    // nasce com o funil antigo, sem estes nomes. Nunca cria etapa nova aqui.
    console.info("[registrarAtendimento] etapa nao encontrada no funil da empresa, ignorada", {
      locationId: p.locationId,
    });
    return;
  }

  // Uma oportunidade por conversa: procura a oportunidade aberta já ligada a
  // este contato neste pipeline, não importa quem criou — se o atendente já
  // abriu o card na mão, a IA reaproveita em vez de duplicar. `source: 'IA'`
  // só marca quem criou o card quando ele nasce aqui embaixo. Não há coluna
  // de conversa em `opportunities`; contato + pipeline + aberta é o proxy
  // disponível no schema atual.
  const { data: existentes, error: existenteError } = await db
    .from("opportunities")
    .select("id, stage_id")
    .eq("location_id", p.locationId)
    .eq("contact_id", p.contactId)
    .eq("pipeline_id", pipeline.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1);
  if (existenteError) throw existenteError;
  const existente = existentes?.[0] ?? null;

  if (existente) {
    if (existente.stage_id === etapa.id) return; // nada mudou — não polui a conversa

    const { data: etapaAtual, error: etapaAtualError } = await db
      .from("stages")
      .select("name, position")
      .eq("id", existente.stage_id)
      .maybeSingle();
    if (etapaAtualError) throw etapaAtualError;

    // Fora do território da IA: o card já saiu da allowlist (humano avançou
    // na mão, por exemplo). A IA não puxa de volta.
    if (!etapaAtual || !NOMES_DA_IA.has(etapaAtual.name)) return;

    // Dentro do território, só avança — nunca retrocede.
    if (etapa.position <= etapaAtual.position) return;

    const { error: moverError } = await db
      .from("opportunities")
      .update({ stage_id: etapa.id })
      .eq("id", existente.id);
    if (moverError) throw moverError;

    await registrarEvento(
      db,
      p.locationId,
      p.conversationId,
      `Oportunidade movida de ${etapaAtual.name} → ${etapa.name} pela IA`
    );
    return;
  }

  const { error: criarError } = await db.from("opportunities").insert({
    location_id: p.locationId,
    contact_id: p.contactId,
    pipeline_id: pipeline.id,
    stage_id: etapa.id,
    name: nomeContato,
    source: "IA",
  });
  if (criarError) throw criarError;

  await registrarEvento(
    db,
    p.locationId,
    p.conversationId,
    `Oportunidade criada em ${etapa.name} pela IA`
  );
}

async function registrarEvento(
  db: any,
  locationId: string,
  conversationId: string,
  body: string
): Promise<void> {
  // `direction: "out"`, não "in": o trigger `messages_automation` ->
  // `private.on_message_in` (supabase/migrations/0007_automations.sql) só
  // reage a `direction = 'in'`, enfileirando a automação "cliente-respondeu"
  // com o body da mensagem. Um evento interno gravado como "in" faria as
  // automações do dono da agência disparar achando que o cliente falou. O
  // `PipelineEvent` (thread.tsx) decide a renderização por `type === 'event'`,
  // antes de olhar `direction` — a pílula continua igual.
  const { error } = await db.from("messages").insert({
    location_id: locationId,
    conversation_id: conversationId,
    direction: "out",
    type: "event",
    channel: "whatsapp",
    body,
  });
  if (error) throw error;
}
