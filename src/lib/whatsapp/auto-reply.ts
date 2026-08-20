import { chat, modeloPermitido } from "@/lib/ai/openai";
import { INSTRUCAO_ATENDIMENTO, parseAtendimento } from "@/lib/ai/atendimento";
import { transcreverAudio } from "@/lib/ai/transcrever";
import { registrarAtendimento } from "@/lib/crm/oportunidade-ia";
import { assertModuleEnabled } from "@/lib/plan/guard";
import { isLocationSuspended } from "@/lib/plan/suspensao";
import { enviarTexto } from "@/lib/whatsapp/enviar";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Teto de áudio recebido: acima disso não transcreve, trata como mídia não
 * interpretada. O que ele economiza é o WHISPER, não a banda: quando
 * `maybeAutoReply` roda, o webhook já baixou o arquivo do gateway e já subiu
 * para o Storage — o download acontece antes, lá. Sem teto, um áudio longo de
 * um cliente final vira custo aberto (Whisper) na conta do dono da
 * plataforma. Checa duração quando o payload trouxer `seconds`; na ausência
 * dele, só o tamanho em bytes.
 *
 * O teto em bytes precisa ficar ABAIXO do limite de recebimento de áudio
 * (16 MB em `media-limits.ts`), senão é código morto: o webhook já recusou o
 * arquivo antes de chegar aqui.
 */
const TETO_AUDIO_SEGUNDOS = 5 * 60;
const TETO_AUDIO_BYTES = 8 * 1024 * 1024;
const AUDIO_NAO_INTERPRETADO = "[áudio recebido, não foi possível transcrever]";

/**
 * Teto de caracteres por mensagem do histórico. Texto de WhatsApp vai a 65 mil
 * caracteres; 10 mensagens dessas viram um prompt gigante — pago pelo dono da
 * plataforma — a cada resposta automática.
 */
const TETO_BODY_CARACTERES = 2000;

/**
 * Teto de saída do modelo, pelo mesmo motivo do teto de entrada. Desde que a
 * resposta passou a ser JSON (INSTRUCAO_ATENDIMENTO + `json: true`), este
 * teto não cobre só o texto: cobre o envelope inteiro
 * (`{"resposta":"...","dados":{...},"etapa_sugerida":"..."}`), e "dados" pode
 * acumular vários campos (origem, destino, data_ida, data_volta,
 * passageiros...) na mesma rodada. Com 600 o modelo cortava no meio do
 * objeto com alguma frequência — JSON inválido, retry com o mesmo prompt
 * cortando de novo, cliente sem resposta. 900 dá folga de sobra pro
 * envelope: o texto útil de uma resposta de atendimento continua curto,
 * quem cresce é só a moldura em volta dele.
 */
const MAX_TOKENS_RESPOSTA = 900;

/** Duração da URL assinada da imagem enviada à OpenAI: só o tempo de uma
 * chamada de chat, para reduzir a janela de exposição do bucket privado. */
const URL_IMAGEM_TTL_SEGUNDOS = 120;
const IMAGEM_NAO_INTERPRETADA = "[imagem recebida, não foi possível processar]";
const VIDEO_RECEBIDO = "[vídeo recebido]";
const DOCUMENTO_RECEBIDO = "[documento recebido]";

/**
 * Trava de imagem: acrescentada ao FIM do `system` (depois da personalidade,
 * objetivo e informações que o cliente configura), nunca antes — uma
 * personalidade mais assertiva escrita pelo cliente poderia atropelar uma
 * instrução que viesse primeiro. Sem isso, o caso clássico e caro: cliente
 * manda comprovante de PIX, a IA "lê" a imagem e responde "pagamento
 * confirmado" sem ter consultado nada — o erro cai no cliente do dono da
 * plataforma. Texto verbatim do brief da Task 6, não alterar.
 */
const TRAVA_IMAGEM =
  "Você NUNCA confirma pagamento, valor, comprovante, documento ou identidade " +
  "a partir de uma imagem. Se a imagem parecer comprovante, boleto, nota, " +
  "documento ou algo que peça confirmação de valor, responda que um atendente " +
  "humano vai conferir e não afirme nada sobre o conteúdo.";

/**
 * Texto enviado ao cliente final quando o modelo não devolveu JSON utilizável
 * nas duas tentativas. Antes do atendimento em JSON, qualquer texto não vazio
 * do modelo era enviado; sair em silêncio aqui é regressão — a pessoa mandou
 * mensagem no WhatsApp e não recebe nada, e se a falha for determinística não
 * recebe nunca. Não inventa dado nenhum e não menciona erro técnico: só avisa,
 * em pt-BR, que um humano responde em seguida.
 */
const TEXTO_FALLBACK =
  "Recebi sua mensagem! Um atendente já vai responder por aqui, é rapidinho.";

/**
 * Turno de correção acrescentado à SEGUNDA tentativa. Repetir o `messages`
 * idêntico faz uma falha determinística repetir igual e dobra o custo à toa —
 * a retentativa continua sendo UMA só, sem laço.
 */
/**
 * Tira os asteriscos de negrito antes de enviar. Muitas contas WhatsApp
 * Business/API NÃO renderizam `*texto*` como negrito — os asteriscos aparecem
 * crus na tela do cliente (`*Origem:*`), o que passa cara de bot mal-feito.
 * Como não dá para garantir que o número renderiza, o mais seguro é nunca
 * mandar asterisco de ênfase.
 *
 * Remove `**` (negrito markdown) e os `*` que encostam num caractere não-espaço
 * (a ênfase inline), mas PRESERVA o `* ` de início de linha, que é marcador de
 * lista e o WhatsApp renderiza como bullet.
 */
function limparNegrito(texto: string): string {
  return texto
    .replace(/\*\*/g, "")
    .replace(/(?<=\S)\*|\*(?=\S)/g, "");
}

const CORRECAO_JSON =
  "Sua resposta anterior não era um JSON válido. Responda de novo APENAS com o " +
  'objeto JSON, com as chaves "resposta", "dados", "etapa_sugerida", "escalar" ' +
  'e "nome" — nada de texto, explicação ou markdown fora do objeto.';

/**
 * Registra o motivo de cada saída da auto-resposta. Este é o caminho mais
 * caro do produto (gasta OPENAI_API_KEY e a credencial global do provedor a
 * cada mensagem recebida); sem este log não sobra nenhum rastro de que a IA
 * parou de responder. NUNCA logar conteúdo da conversa, transcrição ou
 * credencial — só o motivo e a location.
 */
function sair(locationId: string, motivo: string): void {
  console.info(`[auto-reply] saída: ${motivo} · location ${locationId}`);
}

/**
 * Falha inesperada. Mesmo contrato do `sair`: só motivo, location e código do
 * erro — NUNCA a mensagem do erro (o Postgres ecoa o valor ofensor, que aqui
 * pode ser o conteúdo da conversa do cliente final), nunca credencial.
 */
function falha(locationId: string, onde: string, e: unknown): void {
  console.error(
    `[auto-reply] falha: ${onde} · location ${locationId} · código:`,
    (e as any)?.code ?? "desconhecido",
  );
}

/**
 * Rótulo de mídia acrescentado à legenda do cliente, nunca no lugar dela.
 * Substituir apagava a fala ("segue o comprovante, pode liberar?" virava
 * literalmente `[documento recebido]`) — e é justamente essa fala que a
 * TRAVA_IMAGEM existe para impedir que o modelo confirme.
 */
function comRotulo(legenda: unknown, rotulo: string): string {
  const texto = String(legenda ?? "").trim();
  return texto ? `${texto}\n${rotulo}` : rotulo;
}

/**
 * Auto-responder do WhatsApp. Chamado pelo webhook (service role) depois de
 * gravar uma mensagem de ENTRADA de texto. Best-effort: qualquer falha é
 * engolida — nunca pode quebrar o 200 do webhook.
 *
 * Regras (spec 2026-08-13):
 * - só responde o agente principal (is_primary) com status 'ativo';
 * - não responde se a conversa está com bot_paused=true (humano assumiu);
 * - respeita o daily_limit do canal;
 * - usa as últimas ~10 mensagens da conversa como contexto.
 */
export async function maybeAutoReply(
  db: any,
  p: {
    locationId: string;
    conversationId: string;
    contactId: string;
    channelId: string;
    toPhone: string;
    dailyLimit: number;
    // Duração do áudio em segundos, quando o payload do gateway trouxer
    // (ex.: `audioMessage.seconds`) — propagado pelo webhook da Evolution.
    // Quando ausente, o teto usa só `media_size`.
    audioSeconds?: number;
    // created_at da mensagem de entrada que disparou esta chamada. Serve de
    // marco para o anti-repetição: numa rajada, só a última mensagem responde
    // — as anteriores desistem ao ver que já chegou algo mais novo.
    mensagemEm?: string | null;
  },
): Promise<void> {
  // Anti-repetição: só responde se esta ainda é a mensagem de entrada mais
  // recente da conversa. Se o cliente mandou várias em sequência, cada uma
  // dispara uma chamada; sem isto, cada uma responderia (mensagens repetidas,
  // como as duas do print). Checamos antes de gastar o modelo e de novo antes
  // de enviar (uma nova pode chegar durante a chamada ao modelo). A ÚLTIMA
  // mensagem vence e vê todas as anteriores no histórico.
  async function souAMaisRecente(): Promise<boolean> {
    if (!p.mensagemEm) return true; // sem marco (canal Meta), não dá pra deduplicar — comporta como antes
    const { data } = await db
      .from("messages")
      .select("created_at")
      .eq("conversation_id", p.conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return !data?.created_at || data.created_at <= p.mensagemEm;
  }

  try {
    if (!process.env.OPENAI_API_KEY) return sair(p.locationId, "sem-openai-key");

    // Plano da empresa ANTES de qualquer coisa: este caminho é o mais caro do
    // produto — roda pelo webhook, com service role, e gasta OPENAI_API_KEY e
    // a credencial global do provedor de WhatsApp (ambas na conta do dono da
    // plataforma) a cada mensagem recebida. A location vem do próprio
    // webhook, resolvida pelo canal/conversa. Saída silenciosa como as
    // demais: a função é best-effort e não pode quebrar o 200 do webhook.
    if (await assertModuleEnabled(p.locationId, "whatsapp")) return sair(p.locationId, "modulo-whatsapp-bloqueado");

    // E o módulo da IA, que é quem representa a OPENAI_API_KEY (mesmo módulo
    // exigido por `api/ai/chat`). Os dois são obrigatórios, e por motivos
    // diferentes: `whatsapp` cobre a credencial global do gateway, `agentes-ia`
    // cobre a chave da OpenAI. Desde a 0056, `whatsapp` nasce liberado e
    // `agentes-ia` nasce bloqueado — exatamente a combinação em que o dono
    // acha que desligou a IA e ela continua respondendo. Sem esta guarda,
    // bloquear `agentes-ia` para cortar o gasto de um cliente não cortava
    // nada. Motivo de log distinto do anterior de propósito: são decisões
    // comerciais diferentes.
    if (await assertModuleEnabled(p.locationId, "agentes-ia")) {
      return sair(p.locationId, "modulo-agentes-ia-bloqueado");
    }

    // Empresa suspensa não responde: o webhook roda com service role, então a
    // suspensão da 0051 (que vive na RLS) não chega aqui. Suspender quem parou
    // de pagar tem que parar o gasto de OPENAI_API_KEY e da credencial global
    // do provedor, senão o inadimplente segue consumindo crédito do dono da
    // plataforma. Só esta empresa é pulada — o webhook das demais continua
    // respondendo.
    if (await isLocationSuspended(p.locationId, db)) return sair(p.locationId, "empresa-suspensa");

    // Canal entregável ANTES de gastar qualquer coisa. `enviarTexto` já checa
    // `active` e `connection_state`, mas só na hora do envio — ou seja, DEPOIS
    // de já ter pago Whisper, visão e chat. Canal Evolution/Baileys cai
    // sozinho com frequência, e o limite diário não segura: ele conta saídas
    // GRAVADAS, e envio que falha não grava, então o contador nunca sobe.
    // Sem esta guarda, canal caído = cada mensagem do cliente final paga a
    // OpenAI integral, para sempre, sem entregar nada. Mesmo critério da rota
    // interativa (`api/whatsapp/send/route.ts`).
    const { data: canal } = await db
      .from("whatsapp_channels")
      .select("id, provider, connection_state, active")
      .eq("id", p.channelId)
      .maybeSingle();
    if (!canal) return sair(p.locationId, "canal-nao-encontrado");
    if (!canal.active) return sair(p.locationId, "canal-inativo");
    if (canal.provider === "evolution" && canal.connection_state !== "open") {
      return sair(p.locationId, "canal-desconectado");
    }

    // handoff: humano já assumiu esta conversa?
    const { data: conv } = await db
      .from("conversations")
      .select("bot_paused")
      .eq("id", p.conversationId)
      .maybeSingle();
    if (!conv || conv.bot_paused) return sair(p.locationId, "bot-pausado");

    // agente principal ATIVO da empresa
    const { data: agent } = await db
      .from("ai_agents")
      .select("personality, goal, extra_info, model")
      .eq("location_id", p.locationId)
      .eq("is_primary", true)
      .eq("status", "ativo")
      .maybeSingle();
    if (!agent) return sair(p.locationId, "sem-agente-ativo");

    // limite diário do canal (conta saídas de hoje)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", p.channelId)
      .eq("direction", "out")
      .gte("created_at", startOfDay.toISOString());
    if ((count ?? 0) >= p.dailyLimit) return sair(p.locationId, "limite-diario");

    // Anti-repetição, 1ª checagem: se já chegou mensagem mais nova, desiste
    // ANTES de gastar o modelo — a mais nova responde pela rajada inteira.
    if (!(await souAMaisRecente())) return sair(p.locationId, "mensagem-superada");

    // Histórico (últimas 10, ordem cronológica) — SEM evento interno e SEM
    // anotação interna. Os dois são gravados em `messages` com
    // `direction = 'out'`, então entrariam no prompt como turno do
    // *assistant*: "Oportunidade movida de Novo Lead → Em Negociação pela IA",
    // "Conversa encerrada por Fulano". Três estragos de uma vez: contradiz a
    // INSTRUCAO_ATENDIMENTO (que proíbe mencionar o funil ao cliente), vaza
    // nome de funcionário e nome de etapa para o modelo — que pode devolvê-los
    // ao cliente final da agência — e ainda consome as 10 vagas do contexto,
    // empurrando a conversa real para fora dele.
    const { data: rows } = await db
      .from("messages")
      .select("id, direction, type, body, media_path, media_mime, media_size, media_transcript, created_at")
      .eq("conversation_id", p.conversationId)
      .neq("type", "event")
      .eq("internal", false)
      .order("created_at", { ascending: false })
      .limit(10);
    const history: any[] = (rows ?? []).slice().reverse();

    // Mídia de entrada: processada só agora, DEPOIS de todas as guardas acima
    // (chave, módulo, suspensão, bot_paused, agente, limite diário) — nesta
    // ordem porque é aqui que se gasta Whisper/Vision, crédito global do dono
    // da plataforma. A mensagem mais recente do histórico é a que disparou
    // esta chamada.
    const incoming = history[history.length - 1];
    // URL assinada de curta duração da imagem de entrada, quando houver —
    // NUNCA logar. Presença dela é o sinal de "há imagem nesta rodada", usado
    // abaixo para acrescentar a TRAVA_IMAGEM ao fim do system e montar o
    // conteúdo multimodal da mensagem do usuário.
    let imagemUrlAssinada: string | undefined;
    if (incoming && incoming.direction === "in" && incoming.type === "audio") {
      if (incoming.media_transcript) {
        // Reentrega do gateway: já transcrita, não paga o Whisper de novo.
        incoming.body = incoming.media_transcript;
      } else {
        const duracao = p.audioSeconds;
        const tetoEstourado =
          (typeof duracao === "number" && duracao > TETO_AUDIO_SEGUNDOS) ||
          (typeof incoming.media_size === "number" && incoming.media_size > TETO_AUDIO_BYTES);

        if (tetoEstourado || !incoming.media_path) {
          // Acima do teto: não transcreve. O que se economiza aqui é o
          // Whisper — o arquivo JÁ foi baixado e guardado pelo webhook antes
          // desta função existir na jogada. Motivo distinto de
          // "transcricao-falhou": aqui não houve tentativa de Whisper, é
          // decisão de custo — as duas situações pedem ações opostas
          // (ajustar teto x investigar erro).
          sair(p.locationId, "audio-acima-do-teto");
          incoming.body = comRotulo(incoming.body, AUDIO_NAO_INTERPRETADO);
        } else {
          try {
            const { data: file, error: dlErr } = await db.storage
              .from("conversation-media")
              .download(incoming.media_path);
            if (dlErr || !file) throw dlErr || new Error("download vazio");
            const bytes = await file.arrayBuffer();
            const ext = String(incoming.media_mime ?? "")
              .split(";")[0]
              .split("/")[1]
              ?.trim() || "ogg";
            const texto = await transcreverAudio(bytes, `audio.${ext}`);
            incoming.body = texto;
            // Grava para não pagar de novo numa reentrega. Best-effort: se a
            // escrita falhar, a resposta desta rodada já usa o texto certo.
            await db
              .from("messages")
              .update({ media_transcript: texto })
              .eq("id", incoming.id)
              .then(
                () => {},
                () => {},
              );
          } catch {
            // Download ou Whisper falharam: nunca emudece a IA — responde
            // como mídia não interpretada. Sem conteúdo do áudio nem nome de
            // arquivo do cliente no log.
            sair(p.locationId, "transcricao-falhou");
            incoming.body = comRotulo(incoming.body, AUDIO_NAO_INTERPRETADO);
          }
        }
      }
    } else if (incoming && incoming.direction === "in" && incoming.type === "image") {
      // Imagem de entrada: nenhum byte passa pela nossa função — geramos uma
      // URL assinada de curta duração (120s) do bucket privado e mandamos só
      // a URL pra OpenAI enxergar. Mídia sem media_path é mídia que falhou no
      // webhook (já teria virado type="text" com rótulo lá, mas a checagem
      // aqui é defensiva, não confia só nisso).
      if (!incoming.media_path) {
        incoming.body = comRotulo(incoming.body, IMAGEM_NAO_INTERPRETADA);
      } else {
        try {
          const { data: signed, error: signErr } = await db.storage
            .from("conversation-media")
            .createSignedUrl(incoming.media_path, URL_IMAGEM_TTL_SEGUNDOS);
          if (signErr || !signed?.signedUrl) throw signErr || new Error("sem signed url");
          imagemUrlAssinada = signed.signedUrl;
        } catch {
          // Nunca logar a URL nem o erro do storage (pode ecoar caminho/token).
          sair(p.locationId, "imagem-sem-url-assinada");
          incoming.body = comRotulo(incoming.body, IMAGEM_NAO_INTERPRETADA);
        }
      }
    } else if (
      incoming &&
      incoming.direction === "in" &&
      (incoming.type === "video" || incoming.type === "file")
    ) {
      // Vídeo e documento NÃO são interpretados: a IA só reconhece o
      // recebimento (o texto de fato vem do modelo, guiado por este rótulo) e
      // o bot NÃO pausa — pausar deixaria a conversa muda pra sempre depois
      // de um único anexo. O rótulo é ACRESCENTADO à legenda, nunca no lugar
      // dela: o comprovante mandado "como documento" (documentMessage com
      // mimetype image/jpeg, tipo `file` aqui) vem acompanhado de "segue o
      // comprovante, pode liberar?" — apagar essa frase escondia do modelo
      // exatamente o pedido que a TRAVA_IMAGEM precisa recusar.
      incoming.body = comRotulo(
        incoming.body,
        incoming.type === "video" ? VIDEO_RECEBIDO : DOCUMENTO_RECEBIDO,
      );
    }

    const parts = [
      agent.personality,
      agent.goal ? `Objetivo: ${agent.goal}` : "",
      agent.extra_info ? `Informações: ${agent.extra_info}` : "",
    ].filter((s: string) => s && s.trim());
    let system = parts.join("\n\n") || "Você é um assistente prestativo.";
    // INSTRUCAO_ATENDIMENTO entra DEPOIS do texto do agente e ANTES da
    // TRAVA_IMAGEM (que continua sendo a última, sempre): mesmo princípio dos
    // dois — o cliente define a personalidade, mas nem o formato de resposta
    // nem a trava de imagem podem ser atropelados por ela.
    system = `${system}\n\n${INSTRUCAO_ATENDIMENTO}`;
    // O modelo não tem relógio: sem isso ele chuta a hora e erra a saudação
    // (às 00h dizia "boa tarde"). Injetamos a hora real de Brasília para ele
    // acertar bom dia / boa tarde / boa noite.
    const agora = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    system = `${system}\n\nAgora em Brasília: ${agora}. Use isto para a saudação correta (bom dia até 12h, boa tarde até 18h, boa noite depois) e para qualquer referência a horário ou data.`;
    // A trava é acrescentada DEPOIS do texto do agente (personalidade,
    // objetivo, informações — tudo configurado pelo cliente), nunca antes:
    // uma personalidade mais assertiva escrita pelo cliente poderia atropelar
    // uma instrução que viesse primeiro. Entra sempre que a mensagem que
    // disparou esta rodada for de QUALQUER mídia — não só quando a imagem foi
    // de fato enviada ao modelo. Amarrar a trava à existência da URL assinada
    // deixava de fora justamente os casos mais caros: comprovante mandado
    // "como documento" (chega como `documentMessage` com mimetype image/jpeg
    // e vira tipo `file`), comprovante narrado em áudio, e imagem cuja URL
    // assinada falhou — em todos eles o contexto textual pede confirmação de
    // pagamento, e uma personalidade assertiva configurada pelo cliente
    // confirma.
    const ehMidiaDeEntrada =
      !!incoming &&
      incoming.direction === "in" &&
      ["image", "audio", "video", "file"].includes(String(incoming.type));
    if (ehMidiaDeEntrada) {
      system = `${system}\n\n${TRAVA_IMAGEM}`;
    }

    type ParteConteudo =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };

    const messages: { role: "system" | "user" | "assistant"; content: string | ParteConteudo[] }[] = [
      { role: "system", content: system },
      ...history.map((m) => {
        const role = m.direction === "out" ? ("assistant" as const) : ("user" as const);
        // Trunca sempre: uma única mensagem de WhatsApp pode ter 65 mil
        // caracteres, e o prompt inteiro é pago pelo dono da plataforma.
        const texto = String(m.body ?? "").slice(0, TETO_BODY_CARACTERES);
        if (m === incoming && imagemUrlAssinada) {
          const legenda = texto.trim();
          const partes: ParteConteudo[] = [];
          if (legenda) partes.push({ type: "text", text: legenda });
          partes.push({ type: "image_url", image_url: { url: imagemUrlAssinada } });
          return { role, content: partes };
        }
        return { role, content: texto };
      }),
    ];

    // `json: true` pede response_format json_object (INSTRUCAO_ATENDIMENTO
    // exige que a resposta venha como JSON com "resposta"/"dados"/
    // "etapa_sugerida"). `parseAtendimento` nunca lança; se o JSON vier
    // quebrado, tenta mais UMA vez (com o turno de correção CORRECAO_JSON) —
    // se falhar de novo, o cliente recebe o TEXTO_FALLBACK, nunca o cru: o
    // texto de um JSON malformado é chave-e-chave de campo, nunca fala de
    // atendente, e isso iria para o WhatsApp de um cliente final da agência.
    async function chamarModelo(
      msgs: typeof messages,
    ): Promise<
      | { text: string; usage: { promptTokens: number; completionTokens: number }; finishReason: string | null }
      | null
    > {
      try {
        // O modelo passa pela allowlist do servidor dentro de `chat` — o
        // valor de `ai_agents.model` é digitado pelo cliente em campo livre.
        return await chat(msgs, { model: agent.model, maxTokens: MAX_TOKENS_RESPOSTA, json: true });
      } catch (e) {
        // Separado por status HTTP: 429 (cota estourada) derruba TODAS as
        // empresas ao mesmo tempo, porque a chave é única e global; 401 é
        // chave inválida; 400 costuma ser modelo/payload. Só o status vai pro
        // log — nunca o corpo da resposta, que pode ecoar trecho do prompt.
        const status = (e as any)?.status;
        sair(p.locationId, typeof status === "number" ? `openai-falhou:http-${status}` : "openai-falhou");
        return null;
      }
    }

    let result = await chamarModelo(messages);
    if (!result) return; // motivo já logado em `chamarModelo`
    // Soma o consumo das DUAS tentativas: `ai_logs` é a única contabilidade
    // de consumo por empresa, e uma rodada com parse falho gasta duas
    // chamadas de verdade — registrar só a última deixaria invisível
    // exatamente a rodada mais cara (a que gastou o dobro).
    let promptTokens = result.usage.promptTokens;
    let completionTokens = result.usage.completionTokens;
    let resposta = parseAtendimento(result.text ?? "");
    if (!resposta) {
      // Segunda (e única) tentativa: o mesmo prompt MAIS um turno curto de
      // correção. Mandar `messages` idêntico fazia a falha determinística se
      // repetir igual, cobrando duas chamadas pelo mesmo erro.
      result = await chamarModelo([...messages, { role: "user" as const, content: CORRECAO_JSON }]);
      if (!result) return; // motivo já logado em `chamarModelo`
      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;
      resposta = parseAtendimento(result.text ?? "");
    }

    // Grava o consumo em `ai_logs` — única contabilidade de consumo por
    // empresa. Precisa rodar TAMBÉM nos caminhos de falha (JSON inválido,
    // resposta truncada, envio falhou): são justamente as rodadas mais caras
    // (duas chamadas), e eram as únicas que não deixavam linha nenhuma.
    // `response` vai vazio nesses casos.
    const lastUser = [...history].reverse().find((m: any) => m.direction === "in");
    async function gravarLog(response: string): Promise<void> {
      const { error: logErr } = await db.from("ai_logs").insert({
        location_id: p.locationId,
        feature: "whatsapp-auto",
        model: modeloPermitido(agent.model),
        prompt: String(lastUser?.body ?? "").slice(0, TETO_BODY_CARACTERES),
        response,
        // Soma das duas tentativas quando houve retry — ver comentário acima.
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        created_by: null,
      });
      // Falhar aqui em silêncio significa gasto real da chave global sem
      // registro nenhum.
      if (logErr) falha(p.locationId, "ai-log-nao-gravado", logErr);
    }

    /** Grava a saída enviada + atualiza a conversa (mesma forma do
     * /api/whatsapp/send). Serve tanto para a resposta do modelo quanto para o
     * TEXTO_FALLBACK: o fallback também precisa aparecer no histórico e contar
     * no limite diário. */
    async function gravarSaida(texto: string, waMessageId: string | null | undefined): Promise<void> {
      const { data: msg, error: insErr } = await db
        .from("messages")
        .insert({
          location_id: p.locationId,
          conversation_id: p.conversationId,
          direction: "out",
          type: "text",
          channel: "whatsapp",
          body: texto,
          channel_id: p.channelId,
          wa_message_id: waMessageId,
          status: "sent",
        })
        .select("created_at")
        .single();
      // A mensagem JÁ foi entregue ao cliente final neste ponto: falhar aqui
      // significa resposta enviada e não registrada (o inbox some com ela e o
      // limite diário não conta). É exatamente o tipo de coisa que sumia sem
      // log nenhum.
      if (insErr) falha(p.locationId, "saida-nao-gravada", insErr);
      await db
        .from("conversations")
        .update({
          last_message_at: msg?.created_at ?? new Date().toISOString(),
          last_message_preview: texto,
        })
        .eq("id", p.conversationId);
    }

    if (!resposta) {
      // `finish_reason === "length"` é o modelo cortado pelo teto de
      // tokens ANTES de fechar o objeto JSON — motivo distinto de JSON
      // malformado por outro motivo: um pede aumentar o teto, o outro pede
      // investigar o prompt/modelo. Só o log muda; nos dois o cliente recebe
      // o fallback humano, nunca o JSON cru.
      sair(p.locationId, result.finishReason === "length" ? "resposta-truncada" : "resposta-json-invalida");
      const envioFallback = await enviarTexto(db, p.channelId, p.toPhone, TEXTO_FALLBACK);
      if (envioFallback.ok) {
        await gravarSaida(TEXTO_FALLBACK, envioFallback.waMessageId);
      } else {
        sair(p.locationId, `fallback-envio-falhou:${envioFallback.motivo}`);
      }
      await gravarLog("");
      return;
    }

    // Só `resposta.resposta` vai para o cliente e para o que é gravado.
    // `dados` e `etapaSugerida` nunca aparecem na mensagem — eles só entram
    // depois, via `registrarAtendimento`, no envio.
    const reply = limparNegrito(resposta.resposta);
    if (!reply) return sair(p.locationId, "resposta-vazia");

    // Anti-repetição, 2ª checagem: uma mensagem nova pode ter chegado durante
    // a chamada ao modelo. Se chegou, não envia — a chamada dela vai responder
    // com a resposta já ciente desta. Evita as duas mensagens iguais do print.
    if (!(await souAMaisRecente())) return sair(p.locationId, "mensagem-superada");

    // envia pelo helper único (resolve provedor, checa connection_state e
    // busca o token da instância — ver src/lib/whatsapp/enviar.ts)
    const envio = await enviarTexto(db, p.channelId, p.toPhone, reply);
    if (!envio.ok) {
      // O gasto já aconteceu mesmo sem entrega: registra antes de sair.
      sair(p.locationId, `envio-falhou:${envio.motivo}`);
      await gravarLog("");
      return;
    }

    await gravarSaida(reply, envio.waMessageId);

    // Registra no funil DEPOIS de a resposta já ter sido enviada e gravada:
    // `registrarAtendimento` é best-effort e nunca lança, mas mesmo assim a
    // ordem importa — o cliente já foi atendido antes de qualquer chance de
    // falha aqui. O contrário (deixar o cliente sem resposta porque um insert
    // do funil falhou) é pior para quem está do outro lado.
    await registrarAtendimento(db, {
      locationId: p.locationId,
      conversationId: p.conversationId,
      contactId: p.contactId,
      dados: resposta.dados,
      etapaSugerida: resposta.etapaSugerida,
      nome: resposta.nome,
    });

    // log (best-effort; created_by null = máquina)
    await gravarLog(reply);

    // Escalonamento para humano: SEMPRE por último, depois de o cliente já
    // ter recebido `reply` e depois de `registrarAtendimento` (o card ainda
    // precisa nascer/mover normalmente). Pausar antes de enviar deixaria o
    // cliente sem o aviso que o próprio `reply` já contém. Best-effort total:
    // um try/catch próprio, porque falhar em pausar/sinalizar não pode
    // desfazer o envio nem quebrar o 200 do webhook.
    if (resposta.escalar) {
      try {
        const { data: convAtual } = await db
          .from("conversations")
          .select("unread_count")
          .eq("id", p.conversationId)
          .maybeSingle();
        const { error: escalarError } = await db
          .from("conversations")
          .update({
            bot_paused: true,
            unread_count: (convAtual?.unread_count ?? 0) + 1,
          })
          .eq("id", p.conversationId);
        if (escalarError) throw escalarError;

        // Mesmo formato dos demais eventos internos (registrarEvento em
        // oportunidade-ia.ts): direction "out", nunca "in" — o trigger
        // messages_automation dispara "cliente-respondeu" para toda
        // mensagem de entrada, e este evento não é fala do cliente.
        const { error: eventoError } = await db.from("messages").insert({
          location_id: p.locationId,
          conversation_id: p.conversationId,
          direction: "out",
          type: "event",
          channel: "whatsapp",
          body: `IA encaminhou para atendimento humano — ${resposta.escalar.motivo}`,
        });
        if (eventoError) throw eventoError;
      } catch (e) {
        // Nunca logar o motivo bruto do cliente nem conteúdo da conversa —
        // só location e código do erro, mesmo contrato de `falha`.
        falha(p.locationId, "escalonamento-falhou", e);
      }
    }
  } catch (e) {
    // Best-effort absoluto: nunca propaga pro webhook. Mas nunca silencioso —
    // um throw inesperado aqui (createAdminClient, insert, storage) matava a
    // IA sem UMA linha de log, justamente no caminho que o resto do arquivo
    // se preocupa em rastrear. Só location e código do erro.
    falha(p.locationId, "erro-inesperado", e);
  }
}
