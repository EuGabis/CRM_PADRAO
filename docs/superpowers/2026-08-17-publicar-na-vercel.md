# Publicar o CRM ON na Vercel

Levantado direto do código: as 20 variáveis abaixo são **todas** as lidas por
`src/` e `scripts/`, e conferem exatamente com o `.env.example` — nenhuma órfã,
nenhuma faltando.

## Antes de publicar

1. **Rotacione as chaves que passaram pelo chat** e atualize o `.env.local`:
   a JWT `service_role` do Supabase, a chave da Evolution, e a `sb_secret_`.
   Cadastre as NOVAS na Vercel, não as antigas.
2. **Confirme se o repositório é privado** em
   `github.com/EuGabis/CRM_PADRAO/settings`. A Vercel conecta nos dois casos.

---

## Grupo 1 — obrigatórias: sem elas o app não sobe

| Variável | Onde pegar | O que quebra sem ela |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | tudo |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | idem (`sb_publishable_...`) | tudo |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (`sb_secret_...`) | `createAdminClient()` **lança exceção** (`admin.ts:16`): webhooks, motores e a rota de cadastro de empresa param |

⚠️ Precisa ser a `sb_secret_`, não a JWT `service_role` antiga. A JWT antiga passa
na API de Auth mas o PostgREST a trata como `anon` — e falha **em silêncio**.

## Grupo 2 — obrigatórias em produção, ainda que o build passe sem

| Variável | Valor | Por quê |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<seu-dominio>` | Sem ela, seis lugares caem em `http://localhost:3000`: o link do convite de equipe, o embed de formulário, e o redirect do OAuth do Google Ads. O cliente receberia um convite apontando para a máquina de quem enviou. |
| `AUTOMATION_SECRET` | string aleatória de 32+ | Protege `/api/automations/tick` e `/api/marketing/tick`. Tem que ser **o mesmo valor** gravado no `pg_cron` (ver abaixo). |

## Grupo 3 — por módulo: só faz falta se você usar

| Módulo | Variáveis | Sem elas |
|---|---|---|
| E-mail (convites e campanhas) | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_WEBHOOK_SECRET` | Convite é criado mas não enviado (resposta traz aviso); campanha é pulada. Não quebra nada. |
| WhatsApp oficial (Meta) | `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` | O cliente da Meta **lança exceção** ao ser chamado (`client.ts:14`). Só afeta quem usar o módulo. |
| IA | `OPENAI_API_KEY`, `OPENAI_MODEL` | Rotas de IA respondem 503. |
| Pagamentos (Guru) | `GURU_SYNC_SECRET` | Sincronização responde 401. Tem que bater com `private.guru_sync_config.secret` no banco. |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_API_VERSION` | A aba não conecta. |

Cadastre em **Production, Preview e Development** — a Vercel separa por ambiente, e
esquecer o Preview faz o deploy de branch quebrar de um jeito confuso.

---

## Depois que o domínio existir

O domínio público destrava quatro coisas que hoje estão paradas pelo mesmo motivo.

### 1. Os três `pg_cron` que ficaram de fora

`supabase/setup/README.md` explica: `0009`, `0011` e `0014_guru_sync_config` trazem
o placeholder `https://SEU-DOMINIO` porque não havia URL. Agora troque pelo domínio
real e aplique. Isso liga:

- motor de automações **e** disparo das mensagens agendadas (`0009`)
- envio das campanhas de e-mail marketing (`0011`)
- sincronização da Guru (`0014`)

O `AUTOMATION_SECRET` gravado no `pg_cron` tem que ser idêntico ao da Vercel — se um
lado rotacionar sem o outro, o tick responde 401 e nada dispara, sem erro visível.

### 2. Webhook do WhatsApp oficial (se usar)

Meta App → WhatsApp → Configuration → Webhook:
`https://<seu-dominio>/api/whatsapp/webhook`, com o `WHATSAPP_VERIFY_TOKEN`.

### 3. Webhook do Resend (se usar marketing)

Resend → Webhooks → `https://<seu-dominio>/api/marketing/resend-webhook`, e o
signing secret vai em `RESEND_WEBHOOK_SECRET`.

### 4. Evolution API — o motivo de tudo isso

O gateway precisa entregar mensagem recebida em algum lugar. Sem domínio público, o
cliente conecta o número por QR, consegue enviar, e **não recebe nada** — porque a
Evolution não alcança um `localhost`.

O endereço do webhook será definido no desenho da integração.

---

## Nota sobre o plano gratuito

Funções da Vercel no plano free têm timeout curto. Isso não afeta o WhatsApp nem o
CRM no uso normal, mas **afeta o backfill histórico da Guru**, que já foi ajustado
uma vez por causa disso (`MAX_BACKFILL_DAYS` em `api/integrations/guru/sync`). Se for
usar Pagamentos com histórico grande, é o primeiro lugar que vai reclamar.

O `pg_cron` chamando de fora também não sofre do limite de 1×/dia do Vercel Cron —
por isso o projeto usa `pg_cron` em vez do cron da Vercel, decisão registrada no
`AGENTS.md`.
