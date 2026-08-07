<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Lito CRM — Guia do projeto (leia antes de mexer)

## O que é

CRM all-in-one ("Lito CRM") inspirado no GoHighLevel (engenharia reversa de um vídeo
de demonstração — ver `MAPA_FUNCIONALIDADES.md`, a especificação funcional canônica).

**Backend Supabase em migração módulo a módulo.** Módulos já reais: Contatos,
Leads/Pipelines, Conversas (Realtime), Dashboard, Calendários, Equipe/permissões,
Configurações (empresa/perfil) e Checklist de ativação. Os demais ainda usam os
repositórios mock sobre Zustand — ver "Padrão de migração módulo a módulo" abaixo.

Documentos importantes:
- `MAPA_FUNCIONALIDADES.md` — mapa funcional completo extraído do vídeo de referência
- `docs/superpowers/specs/2026-08-06-crm-frontend-design.md` — spec de design aprovada
- `docs/superpowers/plans/2026-08-06-lito-crm-frontend.md` — plano de implementação executado

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000 (redireciona para /dashboard)
npm run build    # build + type check — deve passar sem erros
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (**variante Base UI,
NÃO Radix**) · Zustand · dnd-kit (kanban) · Recharts (gráficos) · date-fns (ptBR) ·
lucide-react · sonner (toasts).

## Estrutura

```
src/
  app/(app)/           # 19 módulos, cada pasta = 1 item da sidebar
    dashboard/  conversas/  calendarios/  contatos/ (+[id])  leads/
    pagamentos/  ai-studio/  agentes-ia/  marketing/  automacoes/ (+[id] builder)
    sites/  assinaturas/  midia/  reputacao/  relatorios/  marketplace/
    whatsapp/  configuracoes/ (layout próprio + 16 sub-páginas)  ativacao/
  components/
    layout/            # Sidebar, Topbar, SubNav, SupportPanel, WebphonePanel
    shared/            # DataTable, FilterDrawer, KpiCard, SlaBadge, ChannelIcon, EmptyState
    dashboard/ inbox/ contacts/ pipeline/ automations/ modules/   # por domínio
    ui/                # shadcn (Base UI)
  lib/
    config/brand.ts    # ÚNICA fonte do nome/marca ("Lito CRM") — nunca hardcodar
    config/nav.ts      # itens da sidebar (ordem espelha o mapa)
    data/types.ts      # Contact, Conversation, Message, Opportunity, Pipeline, Workflow...
    data/fixtures/     # dados mock pt-BR (50 contatos, 80 oportunidades, 20 conversas...)
    data/store.ts      # Zustand store + ações (moveOpportunity, sendMessage, addContact...)
    data/repos/        # A UI SÓ importa daqui (contacts, opportunities, conversations,
                       # workflows, appointments) — trocar mock por backend = mexer só aqui
```

## Regras que já causaram bugs (não repita)

1. **Base UI ≠ Radix**: `PopoverTrigger`/`DropdownMenuTrigger`/`TooltipTrigger`
   NÃO aceitam `asChild`. Use `render={<Button ... />}` com children fora do render.
2. **`SelectValue` não resolve label do value**: passe children explícito
   `<SelectValue>{label}</SelectValue>`. `onValueChange` recebe `string | null`.
3. **`Accordion` (Base UI)**: sem prop `type`; só `defaultValue={[...]}`.
4. **Zustand**: NUNCA filtrar/mapear dentro do selector
   (`useCrmStore(s => s.x.filter(...))` = loop infinito de render).
   Selecione o array cru e derive com `useMemo` (ver `useOpportunitiesByContact`).
5. **lucide-react não tem ícones de marca** (Facebook/Instagram) — `ChannelIcon`
   usa badges de texto para essas redes.
6. Páginas são client components (`"use client"`) — ícones Lucide não podem ser
   passados de Server para Client component como prop.

## Convenções

- Todo texto de UI em **pt-BR**; datas mock fixas em 2026; moeda via `formatBRL`.
- Ações que dependem de backend: `toast.info("<ação> chega com o backend")`.
- Estilo: h1 `text-lg font-bold text-slate-900`; cards `rounded-xl border bg-white`;
  tabelas `text-xs`; botões `h-8 text-xs`; badge de sucesso
  `bg-emerald-100 text-emerald-700`; primário indigo (#6366f1); sidebar grafite
  (tokens `--lito-*` em `globals.css`).
- Commits em português, convenção `feat(modulo): descrição`.

## Backend (Supabase) — em andamento

Projeto Supabase dedicado (supabase.com, ref `boykcuhxmndlkjhojxhl`). Credenciais em
`.env.local` (NUNCA commitar; modelo em `.env.example`).

- Clientes em `src/lib/supabase/{client,server}.ts` (@supabase/ssr, chave publishable).
- Schema em `supabase/migrations/0001_initial_schema.sql` — **aplicado em 2026-08-06
  via SQL Editor** e verificado: 11 tabelas, RLS deny-by-default, `REVOKE` total do
  `anon` (confirmado por teste REST: 42501 em todas as tabelas), políticas
  `TO authenticated` com checagem de tenant via `private.user_locations()`
  (SECURITY DEFINER em schema não exposto), UPDATE com USING+WITH CHECK,
  trigger de onboarding (signup → perfil + location + pipeline padrão com 9 fases).
- Migrações seguintes, todas com o mesmo padrão de RLS/políticas da 0001:
  `0002` (smart_lists, tasks, contact_fields, bulk_logs), `0003` (snippets +
  publicação realtime), `0004` (equipe: invitations, permissions, sees_all,
  protect_last_admin, convite no signup), `0005` (activation_steps).
- Novas migrações: criar `supabase/migrations/000N_nome.sql` e aplicar via SQL Editor
  (ou `scripts/apply-migration.mjs`, que exige o CA do projeto em
  `scripts/supabase-ca.crt` — TLS sempre verificado, nunca desabilitar).
- Multi-tenant: TODA tabela de domínio tem `location_id`; toda política nova segue o
  padrão membership. Campo `location_members.only_assigned` reservado para o modo
  "ver apenas dados atribuídos" (ainda não aplicado nas políticas).

## E-mail transacional (Resend)

Convites de equipe saem com template próprio do Lito CRM (nada de e-mail padrão do
Supabase). Peças:

- `src/lib/email/invite-template.ts` — HTML com estilo inline (tabelas), pt-BR,
  cores da marca; exporta `renderInviteEmail()` com versões HTML e texto.
- `src/app/api/team/invite/route.ts` — cria o convite E envia o e-mail. Valida a
  sessão com `getUser()` e exige papel admin **no servidor**; a RLS reforça.
  Se `RESEND_API_KEY` faltar ou o envio falhar, o convite é criado e a resposta
  traz `warning` (a UI mostra aviso e o admin copia o link manualmente).
- Env: `RESEND_API_KEY` (privada), `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.
  Provisionado via Vercel Marketplace (`vercel integration add resend/resend-email`);
  `vercel env pull` traz a chave. Projeto Vercel: `lito-crm`.
- Sem domínio verificado no Resend, use `onboarding@resend.dev` (só entrega para o
  e-mail dono da conta) — para produção, verificar domínio no painel do Resend.

## Padrão de migração módulo a módulo (IMPORTANTE)

A estratégia é deixar **uma tela inteira funcional por vez**. Repos reais ficam em
`src/lib/data/repos/db/` (store Zustand carregado do Supabase + ações otimistas);
os módulos ainda não migrados continuam importando dos repos mock em
`src/lib/data/repos/`. Repos db existentes:

- `db/contacts.ts` — contatos, equipe (profiles+membership), CRUD, import em massa
- `db/contacts-module.ts` — smart lists, tarefas, campos personalizados, bulk_logs
  (`logBulk()` registra qualquer ação em massa)
- `db/pipeline.ts` — pipelines/fases/oportunidades, drag&drop persistente,
  gestão de pipelines e fases, mover/excluir em massa
- `db/conversations.ts` — conversas/mensagens + Realtime, trechos
- `db/appointments.ts` — compromissos do calendário
- `db/team.ts` — membros, convites, permissões; `useMyMembership().can(moduleKey)`
  é o guard de navegação (admin sempre true; usuário: só bloqueia se explicitamente
  `false` — membros antigos com `{}` continuam vendo tudo)

## Estado atual / próximos passos

- ✅ Front-end: 19 módulos navegáveis, todas as sub-abas com conteúdo.
- ✅ Backend F1: schema multi-tenant com RLS aplicado e verificado (migração 0001).
- ✅ Backend F2a: login/cadastro (/login, com vinheta animada) + proxy.ts protegendo
  todas as rotas (getUser server-side) + logout no avatar do topbar.
- ✅ Backend F2b: módulo **Contatos 100% funcional** com Supabase — lista/CRUD/edição,
  listas inteligentes, tarefas, empresas (derivadas), campos personalizados (aparecem
  no cadastro e detalhe), importação/exportação CSV, log real de ações em massa.
- ✅ Backend F2c: módulo **Leads/Pipelines 100% funcional** — kanban real com drag &
  drop persistente (status ganho/perda deduzido pela fase), criar oportunidade,
  vista lista com ações em massa, gestão completa de pipelines/fases,
  oportunidades reais no detalhe do contato.
- ✅ Backend F2d: módulo **Conversas 100% funcional com Realtime** (migração 0003:
  snippets + publicação realtime) — enviar/agendar/nota interna persistem, nova
  conversa por contato+canal, trechos reais usados no composer, estatísticas
  calculadas, badge "Ao vivo". Repo: `db/conversations.ts`. Ações manuais e links
  de acionamento = empty states (dependem de Automações real).
- ✅ Backend F2e: **Dashboard** com widgets calculando sobre dados reais
  (adapters `useDbPipelines/useDbOpportunities/useDbPipeline` em `db/pipeline.ts`).
- ✅ Backend F2f: módulo **Calendários** real — compromissos do banco (repo
  db/appointments.ts), grade semanal com navegação e "Hoje", criar/excluir
  compromisso (com contato vinculado), lista futuro/passado. Sync Google = futura.
- ✅ Backend F2g: **Equipe e permissões** (migração 0004) — convites por e-mail
  (trigger de signup vincula à empresa que convidou em vez de criar nova),
  papéis admin/usuário, permissões por módulo (jsonb em `location_members`),
  modo "ver apenas dados atribuídos" aplicado nas políticas RLS de contacts e
  opportunities via `private.sees_all()`, trigger `protect_last_admin` impedindo
  a empresa ficar sem administrador. Sidebar respeita permissões; a tela
  /configuracoes/equipe é restrita a admins.
- ⏳ Próximo: Pagamentos, Automações reais
  (Edge Functions), Equipe/convites em Configurações.
- ⏳ Backlog: personalizar template/remetente dos e-mails de auth do Supabase
  (pedido do Gabriel), storage (Mídia Drive/arquivos), automações reais
  (Edge Functions), dark mode, mobile, WhatsApp (Cloud API / Evolution API).
