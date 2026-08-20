/* eslint-disable @typescript-eslint/no-explicit-any */

import { statusForStageName } from "@/lib/automations/actions";

/**
 * O que a IA pode fazer no funil. Esta lista é a garantia — pedir ao modelo
 * "não mova para Ganho" no prompt é pedido, não regra: basta uma conversa
 * criativa para ele desobedecer.
 *
 * `Proposta Enviada` fica de fora porque quem envia proposta é o consultor,
 * muitas vezes fora do CRM — a IA não tem como saber que aconteceu.
 * `Fechado/Ganho` fica de fora porque é o número de venda da agência: "pode
 * fechar então!" não é uma venda, o cliente não pagou nem emitiu.
 *
 * `Perdido` entra: errar um perdido é recuperável (o consultor arrasta de
 * volta) e não infla receita. A assimetria entre ganho e perdido é
 * deliberada — não "conserte" achando que é inconsistência.
 */
const ETAPAS_DA_IA: Record<string, string> = {
  "novo-lead": "Novo Lead",
  "em-negociacao": "Em Negociação",
  "perdido": "Perdido",
};

/**
 * Chaves que a IA pode gravar em `contacts.custom_fields` — exatamente as que
 * `INSTRUCAO_ATENDIMENTO` (`src/lib/ai/atendimento.ts`) enumera. Sem allowlist
 * o modelo inventa grafia (`data_ida`, `dataIda` e `ida` viram três campos
 * diferentes ao longo das conversas e o dono não consegue relatório) e, pior,
 * pode envenenar as automações do dono: `templateVars`
 * (`src/lib/automations/actions.ts`) mescla `custom_fields` DEPOIS das
 * variáveis embutidas, então uma chave `email` ou `telefone` vinda do modelo
 * sobrescreveria o `{{email}}` dos templates.
 */
const CAMPOS_DA_IA = new Set([
  "origem",
  "destino",
  "data_ida",
  "data_volta",
  "passageiros",
]);

interface RegistrarAtendimentoParams {
  locationId: string;
  conversationId: string;
  contactId: string;
  dados: Record<string, string>;
  etapaSugerida: string | null;
  /** Nome que a IA coletou nesta rodada, para renomear contato e card. Null quando não veio. */
  nome: string | null;
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
    owner_id: string | null;
  } | null = null;

  try {
    const { data, error } = await db
      .from("contacts")
      .select("first_name, last_name, custom_fields, owner_id")
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

  // Nome que a IA coletou: renomeia o contato (hoje o nome vem do pushName do
  // WhatsApp, que muitas vezes é apelido/emoji/nome de loja) e passa a valer
  // como título do card. Só quando `nome` veio de fato — nunca sobrescreve
  // com vazio, e o `?? ""` do last_name evita gravar "undefined".
  let nomeContato = `${contato.first_name} ${contato.last_name}`.trim() || "Contato";
  if (p.nome) {
    const partes = p.nome.trim().split(/\s+/);
    const first = partes.shift() ?? "";
    const last = partes.join(" ");
    if (first) {
      try {
        await db
          .from("contacts")
          .update({ first_name: first, last_name: last })
          .eq("id", p.contactId)
          .eq("location_id", p.locationId);
        nomeContato = `${first} ${last}`.trim();
      } catch (err) {
        logFalha(p.locationId, err);
      }
    }
  }

  try {
    await sincronizarOportunidade(db, p, nomeContato, contato.owner_id ?? null);
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
    if (!CAMPOS_DA_IA.has(chave)) {
      // Só o nome da chave no log — NUNCA o valor, que é dado do cliente final.
      console.info("[registrarAtendimento] campo fora da allowlist, descartado", {
        locationId,
        chave,
      });
      continue;
    }
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
 * `Fechado/Ganho` é terminal para a IA: se a etapa ATUAL do card já é
 * Fechado/Ganho, ela não mexe — nem para Perdido, nem para qualquer outra.
 * Uma conversa mal interpretada não pode apagar uma venda já registrada; para
 * reabrir, o humano arrasta na mão. Fora desse caso, ela move livremente
 * entre as três etapas da allowlist, em qualquer direção (inclusive de
 * `Proposta Enviada` para `Perdido`, quando o cliente recusa depois de já ter
 * recebido proposta). Etapa atual não encontrada (`stage_id` órfão) também
 * não move — falha fechada.
 */
async function sincronizarOportunidade(
  db: any,
  p: RegistrarAtendimentoParams,
  nomeContato: string,
  ownerId: string | null
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

  // Um card por contato, em qualquer status — sem o filtro `status = "open""`
  // um cliente que volta depois de Fechado/Ganho ou Perdido ganhava card
  // novo em vez de reabrir o mesmo. Se houver mais de um (um humano pode ter
  // criado outro pela tela), pega o mais recente por `created_at`, com `id`
  // como desempate determinístico — nunca cria um segundo.
  const { data: existentes, error: existenteError } = await db
    .from("opportunities")
    .select("id, stage_id, status, name")
    .eq("location_id", p.locationId)
    .eq("contact_id", p.contactId)
    .eq("pipeline_id", pipeline.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (existenteError) throw existenteError;
  const existente = existentes?.[0] ?? null;

  // status é derivado do NOME da etapa de destino (Perdido -> lost; as
  // outras duas etapas da allowlist -> open). Reaproveita a mesma regra de
  // `src/lib/automations/actions.ts` em vez de uma terceira cópia. A IA
  // nunca deve gravar "won": as três etapas da allowlist (Novo Lead, Em
  // Negociação, Perdido) não contêm "GANHO"/"GANHA"/"ASSINOU", então esse
  // caminho não alcança "won" mesmo que a função devolva esse valor para
  // outros nomes de etapa.
  const status = statusForStageName(nomeEtapa);

  if (existente) {
    // Título do card acompanha o nome do contato. O card nasceu com o nome
    // antigo (pushName/telefone); quando a IA descobre o nome de verdade, o
    // card precisa refletir isso mesmo que a etapa não mude. Só grava se
    // realmente diferente — não é evento, é correção silenciosa do rótulo.
    if (nomeContato && existente.name !== nomeContato) {
      const { error: renomearError } = await db
        .from("opportunities")
        .update({ name: nomeContato })
        .eq("id", existente.id);
      if (renomearError) throw renomearError;
    }

    if (existente.stage_id === etapa.id) return; // etapa não mudou — não move nem gera evento

    // Segunda linha de defesa: card já marcado como ganho por outro caminho
    // (automação do dono, importação, ou etapa cujo nome não denuncia a
    // venda) — nem precisa olhar a etapa atual.
    if (existente.status === "won") {
      console.info("[registrarAtendimento] card marcado como ganho, IA nao move", {
        locationId: p.locationId,
      });
      return;
    }

    const { data: etapaAtual, error: etapaAtualError } = await db
      .from("stages")
      .select("name, position")
      .eq("id", existente.stage_id)
      .eq("location_id", p.locationId)
      .maybeSingle();
    if (etapaAtualError) throw etapaAtualError;

    // Etapa atual não encontrada (stage_id órfão): não move — falha fechada.
    if (!etapaAtual) return;

    // Fechado/Ganho é terminal para a IA: uma conversa mal interpretada não
    // pode apagar uma venda já registrada. Para reabrir, o humano arrasta.
    // O nome da etapa é editável pelo dono (renameStage) e empresas antigas
    // têm funil divergente — comparar o nome literal ("Fechado/Ganho") furava
    // assim que alguém renomeasse para "Ganho" ou tivesse "ASSINOU" no funil
    // legado. `statusForStageName` é o mesmo predicado usado duas linhas
    // abaixo para o status de destino — uma única noção de "isto é venda".
    if (statusForStageName(etapaAtual.name) === "won") {
      console.info("[registrarAtendimento] card em etapa de ganho, IA nao move", {
        locationId: p.locationId,
      });
      return;
    }

    // A IA NUNCA retrocede no funil. Ela avança (Novo Lead → Em Negociação) e
    // pode marcar Perdido; voltar para uma etapa anterior é decisão humana.
    // Sem esta regra o modelo oscilava a cada mensagem — ao responder "1
    // adulto" ele reclassificava como "ainda coletando = Novo Lead" e puxava
    // o card de volta de Em Negociação, na mesma conversa. `Perdido` é
    // exceção: não é "voltar", é uma saída lateral, e o cliente pode desistir
    // a qualquer momento.
    const ehPerdido = status === "lost";
    if (!ehPerdido && etapa.position <= etapaAtual.position) {
      return; // destino não avança e não é Perdido — não mexe, não polui a conversa
    }

    const { error: moverError } = await db
      .from("opportunities")
      .update({ stage_id: etapa.id, status })
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

  // `owner_id` vem do contato, igual à ação `criar-oportunidade` das
  // automações (`src/lib/automations/actions.ts`). Sem ele a RLS de
  // `opportunities` (0039: `sees_all(location_id) or owner_id = auth.uid()`)
  // esconde o card da IA de qualquer membro com `only_assigned = true` — ele
  // não lê nem edita. Hoje passa porque o default é `only_assigned = false`,
  // mas some no dia em que a agência restringir um vendedor.
  const { error: criarError } = await db.from("opportunities").insert({
    location_id: p.locationId,
    contact_id: p.contactId,
    pipeline_id: pipeline.id,
    stage_id: etapa.id,
    name: nomeContato,
    source: "IA",
    owner_id: ownerId,
    status,
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
