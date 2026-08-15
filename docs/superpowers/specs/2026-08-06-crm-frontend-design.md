# Spec — Front-end completo do CRM ON

**Data:** 2026-08-06
**Fonte de requisitos:** `MAPA_FUNCIONALIDADES.md` (mapeamento do vídeo de referência WeSales/GoHighLevel)
**Status:** aprovada pelo usuário (design validado em conversa)

## 1. Objetivo

Construir o front-end completo do **CRM ON**: um CRM all-in-one com os 19 módulos do mapa de funcionalidades. Nesta etapa não há backend — o app é totalmente navegável e interativo com dados fictícios, arquitetado para receber um backend depois sem reescrever telas.

## 2. Decisões aprovadas

| Decisão | Escolha |
|---|---|
| Escopo | Shell completo (19 módulos navegáveis) + 5 módulos core profundos |
| Stack | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Visual | Identidade própria (CRM ON) sobre o layout estrutural do mapa |
| Marca | "CRM ON", centralizada em `src/lib/config/brand.ts` |
| Dados | Mock tipado + contrato de repositório sobre store em memória (Zustand) |

Bibliotecas de apoio: **dnd-kit** (kanban), **Recharts** (gráficos), **Zustand** (estado), **lucide-react** (ícones, já vem com shadcn).

## 3. Arquitetura

### 3.1 Estrutura de pastas

```
src/
  app/
    (app)/                  # layout com sidebar + topbar
      dashboard/
      conversas/
      calendarios/
      contatos/
      leads/
      pagamentos/
      ai-studio/
      agentes-ia/
      marketing/
      automacoes/
      sites/
      assinaturas/
      midia/
      reputacao/
      relatorios/
      marketplace/
      whatsapp/
      configuracoes/        # com sub-rotas (perfil, equipe, whatsapp, telefonia...)
      ativacao/             # checklist de onboarding
    error.tsx / not-found.tsx
  components/
    layout/                 # Sidebar, Topbar, SubNav
    ui/                     # shadcn
    shared/                 # DataTable, FilterDrawer, EmptyState, KpiCard, SlaBadge, ChannelIcon
    dashboard/  inbox/  contacts/  pipeline/  automations/   # por domínio
  lib/
    config/brand.ts         # nome, logo, cores da marca
    data/
      types.ts              # Contact, Conversation, Message, Opportunity, Pipeline, Workflow, User, Appointment...
      fixtures/             # dados fictícios pt-BR
      repos/                # contactsRepo, conversationsRepo, opportunitiesRepo, workflowsRepo...
      store.ts              # Zustand store
```

### 3.2 Camada de dados (contrato de repositório)

- A UI **nunca** importa fixtures diretamente; consome funções de repositório (`contactsRepo.list(filtros)`, `opportunitiesRepo.move(id, faseId)`, `conversationsRepo.sendMessage(...)`).
- Repositórios operam sobre um store Zustand inicializado com as fixtures — mutações funcionam durante a sessão (sem persistência entre reloads nesta etapa).
- Os tipos em `types.ts` espelham o mapa e servirão de especificação para o futuro banco (ex.: Supabase). A troca do mock por backend acontece apenas dentro dos repositórios.
- Volume das fixtures: ~50 contatos, ~20 conversas com mensagens, ~80 oportunidades distribuídas nas 9 fases, ~8 workflows, ~6 usuários, compromissos de uma semana.

### 3.3 Design system

- Sidebar escura em grafite/azul-noite (própria, não o roxo GHL); acento primário indigo/violeta; verde para WhatsApp/sucesso; vermelho para SLA/alertas.
- Tipografia Inter; conteúdo em tema claro; cards arredondados; tokens no Tailwind config. Dark mode fora do escopo desta etapa.
- Componentes transversais (seção 22 do mapa): `DataTable` (ordenação, seleção em massa com barra contextual, paginação, busca), `FilterDrawer` (condições campo/operador/valor com E/OU), `EmptyState` (ícone + título + texto + CTA), `KpiCard` (valor + variação % com seta), `SubNav` (abas horizontais por módulo), `SlaBadge`, `ChannelIcon` (WhatsApp/IG/FB/SMS/e-mail).

## 4. Escopo por módulo

### 4.1 Módulos core (profundos e interativos)

**Dashboard** (`/dashboard`)
- Grid de widgets: donut de status da oportunidade, barras de valor por status + receita total, gauge de taxa de conversão, funil por fase (com colunas Cumulativo e Próxima etapa %), donut de distribuição de fases, tabela de fonte de leads, card de ações manuais pendentes, cards Google Analytics (mock), lista de tarefas.
- Filtro de data com presets ("Trimestre passado" etc.) e seletor de múltiplos dashboards (popover com busca + "Adicionar painel", mock).
- Cada widget com seletor de pipeline.

**Conversas** (`/conversas`)
- Layout 4 colunas: rail de ícones (busca, atribuídas, grupo, views salvas com popover "Criar visualização"), lista de conversas (abas Não lidos/Todos/Recentes/Marcados, badge SLA vermelho, contador de não lidas, prévia, estrela, dropdown de ordenação incl. SLA), thread (bolhas com horário, separadores de data, player de áudio visual, eventos de pipeline inline), painel direito do contato.
- Composer: seletor de canal (WhatsApp/SMS/E-mail) + aba Comentário Interno; toolbar (emoji, anexo, áudio, tag...); envio funcional via repositório; modal de agendamento de mensagem (data/hora/fuso).
- Painel do contato: abas Todos os campos / DND / Ações; sub-painéis Compromissos, Tarefas, Observações, Arquivos (abas Todos/Interno/Enviado/Recebido); cartões de oportunidades do contato.

**Contatos** (`/contatos`)
- Sub-abas: Contatos, Listas inteligentes, Ações em massa, Tarefas, Empresas, Configurações (as três últimas como empty states).
- DataTable: Nome (avatar), Telefone, E-mail, Nome comercial, Criado, Última atividade (ícone do canal), Tags; ordenação e busca.
- Seleção em massa → barra contextual com as 12 ações do mapa (Enviar SMS/E-mail/WhatsApp, Solicitar avaliações, Gerenciar empresas/oportunidades, Acionar automação, Adicionar/Remover tags, Exportar, Mesclar, Excluir) — ações abrem confirmação/toast mock.
- Drawer de filtros avançados (campos do contato + UTM); smart lists como abas; modal "+ Adicionar Contato"; página de detalhe do contato.

**Leads / Pipeline** (`/leads`)
- Kanban com as 9 fases do pipeline de exemplo (NOVO LEAD → ... → PERDIDO), cores por fase, contagem + soma monetária, colapso de coluna.
- Cards: nome, fonte, valor, avatar do owner, quick-actions com badges (ligar, conversa, tags, notas, tarefa, agendar).
- Drag & drop (dnd-kit) atualizando o store; seletor de pipeline; alternância kanban/lista; "+ Adicionar oportunidade" (modal).

**Automações** (`/automacoes`)
- Lista: pastas, busca, tabela (Nome, Status Published/Draft, Total de inscritos, Inscritos ativos, datas), botões Criar pasta / "Construa usando IA" (visual) / Criar fluxo.
- Builder visual simplificado: canvas com nós Trigger → Ações → Fim; painel lateral com ~10 triggers e ~15 ações do mapa (busca + categorias); adicionar/remover/reordenar nós; toggle Rascunho/Publicar. Sem execução real.

### 4.2 Módulos shell (primeira dobra fiel + empty states)

Todos com `SubNav` das sub-abas exatas do mapa; sub-abas não construídas usam `EmptyState` fiel. Conteúdo de primeira dobra:

- **Calendários:** grade semanal estática com eventos mock e seletor de visualização.
- **Pagamentos:** tela de Integrações (cards Stripe/PayPal/Mercado Pago/etc. com botão Conectar) + tabela de Documentos e contratos com abas de status.
- **AI Studio / Agentes de IA:** painel de Conversation AI (KPIs mock) + lista de agentes + tela de configuração do bot com os 3 prompts (Personalidade/Meta/Informações adicionais) e chips de ações.
- **Marketing:** planejador social (tabela de publicações + modal de conexão de redes com as 10 plataformas).
- **Sites:** tela de Funis (empty state rico) + tabela de Formulários.
- **Assinaturas:** painel do Portal do cliente (cards de URL, métricas e ações).
- **Mídia Drive:** grid de arquivos mock com toolbar (upload, Canva, pastas).
- **Reputação:** grid de integrações de plataformas de avaliação.
- **Relatórios:** lista de relatórios personalizados + tela Google Ads com KPIs e tabela de campanhas (dados de amostra).
- **Marketplace:** grid de cards de apps com filtros laterais e paginação.
- **WhatsApp:** tela de instâncias (API não oficial) + abas Números/Modelos da API oficial com tabelas mock.
- **Configurações:** menu em 3 grupos (Minha Empresa / Empresariais / Configurações) com telas de Perfil da empresa, Minha equipe (tabela de usuários + formulário com Funções & Permissões e árvore de permissões) e demais como empty states.
- **Ativação:** checklist dark com os 7 passos em accordions, anel de progresso e cards laterais.
- **Topbar:** botões Suporte e Webphone abrem painéis mock (chat de suporte; discador com teclado).

## 5. Tratamento de erros

- `not-found.tsx` amigável para rotas inexistentes; `error.tsx` global de segurança.
- Sem chamadas de rede nesta etapa — estados de erro de rede ficam para a fase de backend.
- Toda lista tem empty state; nenhuma tela renderiza quebrada.

## 6. Verificação

- `npm run build` sem erros e sem warnings de tipo.
- Verificação visual navegando por todas as 19 rotas no navegador, conferindo contra o `MAPA_FUNCIONALIDADES.md`.
- Interações-chave testadas manualmente: mover card no kanban, enviar mensagem no composer, seleção em massa em contatos, criar workflow no builder.

## 7. Fora do escopo desta etapa

- Backend, autenticação, persistência entre reloads.
- Dark mode do conteúdo.
- Execução real de automações, envio real de mensagens, integrações externas.
- Multi-tenancy funcional (o seletor de subconta existe apenas visualmente).
- Responsividade mobile completa (alvo: desktop; nada pode quebrar feio em telas menores, mas otimização mobile fica para depois).
