# Lito CRM

CRM all-in-one (inspirado no GoHighLevel), construído com Next.js + TypeScript +
Tailwind + shadcn/ui e backend **Supabase** (Postgres + Auth + RLS multi-tenant).

**Fase atual:** autenticação completa (login/cadastro com onboarding automático) e
migração módulo a módulo do mock para dados reais — **Contatos** e **Leads/Pipelines**
já são 100% Supabase; os demais módulos seguem com dados de demonstração até suas
fases. Detalhes técnicos e estado exato em `AGENTS.md`.

## Rodando o projeto

```bash
npm install
npm run dev
```

Abra http://localhost:3000 (redireciona para `/dashboard`).

Build de produção + type check:

```bash
npm run build
```

## O que está pronto

19 módulos com todas as sub-abas preenchidas:

| Módulo | Destaques |
|---|---|
| Dashboard | 9 widgets (funil, donuts, gauge, fonte de leads), filtro de data, múltiplos painéis |
| Conversas | Inbox omnichannel 4 colunas, SLA, composer WhatsApp/SMS/E-mail, notas internas, agendamento de mensagem, painel do contato |
| Calendários | Grade semanal (sync Google mock), lista de compromissos, configurações |
| Contatos ✅ Supabase | CRUD real, listas inteligentes, tarefas, empresas, campos personalizados, import/export CSV, log de ações em massa |
| Leads ✅ Supabase | Kanban real com drag & drop persistente, vista lista com ações em massa, gestão de pipelines e fases |
| Pagamentos | Transações, faturas, pedidos, assinaturas, links, vendas, produtos, cupons, contratos c/ assinatura eletrônica, integrações |
| Agentes de IA | Bots com 3 prompts (Personalidade/Meta/Informações), 7 ações, chat de teste, base de conhecimento, voz, logs |
| Marketing | Planejador social multi-rede, comentários, escuta social, e-mail marketing, afiliados, anúncios |
| Automações | Lista com pastas + builder visual (10 triggers, 16 ações) |
| Sites | Funis, sites, lojas, webinars, analytics, blogs, formulários, quizzes, widget de chat, QR codes |
| Assinaturas | Portal do cliente, cursos, comunidades, certificados |
| Reputação | Reviews multi-plataforma, solicitações, widgets, IA de resposta |
| Relatórios | Google Ads, Meta Ads, atribuição (dados reais do mock), ligações, agentes, compromissos |
| + | Mídia Drive, Marketplace (grid de apps), WhatsApp (API oficial + instâncias QR), Configurações (16 telas), Checklist de Ativação, Suporte e Webphone no topo |

## Arquitetura de dados (importante para o backend futuro)

A UI **nunca** importa dados diretamente — consome hooks/ações de
`src/lib/data/repos/*` (contacts, opportunities, conversations, workflows,
appointments), que operam sobre um store Zustand inicializado com fixtures pt-BR.

Para plugar um backend (ex.: Supabase), basta trocar a implementação dos
repositórios; os tipos em `src/lib/data/types.ts` servem de especificação do banco.

## Documentação do projeto

- `MAPA_FUNCIONALIDADES.md` — especificação funcional (engenharia reversa do vídeo de referência)
- `docs/superpowers/specs/` — spec de design aprovada
- `docs/superpowers/plans/` — plano de implementação executado
- `AGENTS.md` — guia técnico para agentes/desenvolvedores (convenções, armadilhas conhecidas, estrutura)

## Marca

Nome, slogan e identidade ficam centralizados em `src/lib/config/brand.ts` —
trocar a marca do produto inteiro é editar um arquivo.
