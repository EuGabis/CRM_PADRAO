# Mapa de Funcionalidades — CRM 2.0

> Mapeamento completo extraído do vídeo de demonstração do WeSales CRM (white-label do GoHighLevel), a partir da transcrição (`crm_ideia.txt`) e dos 527 frames (`crm_ideia_frames/`). Serve como especificação de referência para o CRM 2.0.

---

## 1. Visão geral do produto

- **Plataforma:** CRM all-in-one multi-tenant (estrutura de subcontas/"locations", padrão GoHighLevel — URLs `app.wesalescrm.com/v2/location/{locationId}/...`).
- **Proposta central:** tudo ilimitado — contatos, pipelines, automações, usuários, dashboards — sem custo por assento.
- **Idioma:** PT-BR (tradução parcial; algumas telas e datas em inglês).
- **Apps:** aplicativo mobile (iOS/Android) e desktop (macOS/Windows).

---

## 2. Layout global e navegação

### 2.1 Sidebar principal (escura, item ativo em roxo)
Ordem exata dos itens:

1. Checklist de Ativação (item especial no topo)
2. Painel de controle (Dashboard)
3. Conversas
4. Calendários
5. Contatos
6. Leads
7. Pagamentos
8. AI Studio (badge "Beta")
9. Agentes de AI
10. Marketing
11. Automações
12. Sites
13. Assinaturas
14. Mídia Drive
15. Reputação
16. Relatórios
17. Apps do marketplace
18. WhatsApp API Não Oficial (item custom)
19. Configurações (fixado no rodapé)

Acima do menu: logo, **seletor de subconta** (dropdown de locations), **busca global** (Ctrl+K) com botão "+" de criação rápida.

### 2.2 Topbar (preta, persistente)
- Botão "Suporte" (verde-limão)
- Botão "Webphones" (discador VoIP)
- Ícone de telefone (abre discador)
- Sino de notificações
- Avatar do usuário
- Contextuais por módulo: "O que há de novo", badges de atualizações

---

## 3. Dashboard (Painel de controle)

### Gestão de painéis
- Múltiplos dashboards por conta (**ilimitados**): popover com busca de painel, "+ Adicionar painel"
- Grupos: "Meus painéis de controle" e "Compartilhado comigo" (**dashboards compartilháveis entre usuários**), com pin/fixar
- Totalmente personalizável (widgets arrastáveis, grid 2–3 colunas + widgets full-width)

### Filtro de data global
- Presets ("Trimestre passado" etc.), dois calendários lado a lado, campos De/Para
- **Comparação de períodos** ("Intervalo de datas de comparação")

### Widgets observados (cada um com seletor próprio de pipeline + engrenagem)
| Widget | Tipo |
|---|---|
| Status da Oportunidade | Donut com total central e legenda por status |
| Valor de Oportunidade | Barras horizontais por status + receita total |
| Taxa de conversão | Gauge/anel + receita ganha |
| Funil | Funil horizontal por fase com colunas "Cumulativo" e "Próxima etapa de conversão" (%) |
| Distribuição de fases | Donut por fase com valores e % |
| Ações manuais | Contadores de pendências (Telefone, SMS, Total) + link |
| Relatório de fonte de leads | Tabela: Fonte, Total de leads, Valores, Aberto, Ganho, Perdido, Abandonado, % de ganhos |
| Google Analytics (12 meses) | Cards de métricas (visitantes, pageviews, direto/pago/social/orgânico) + gráfico temporal |
| Widget de tarefas/listas | Lista com empty state |

---

## 4. Conversas (Inbox Omnichannel)

### 4.1 Sub-abas do módulo
Conversas | Ações manuais | Trechos (snippets/respostas rápidas) | Links de acionamento (trigger links) | Estatísticas | Configurações

### 4.2 Canais suportados
WhatsApp (API oficial e não oficial), Instagram, Facebook Messenger, TikTok, SMS, E-mail — tudo em um só lugar. Suporte a **múltiplos números/identidades de envio** (dropdown de remetente, canais custom nomeáveis, ex. "WPP" como segundo número).

### 4.3 Estrutura em 4 colunas
1. **Rail de ícones da inbox:** nova conversa, busca, atribuídas a mim/não atribuídas, caixa de entrada do grupo, bot, **Visualizações salvas** (views/filtros pré-prontos: criar visualização, buscar, ex. "ORGANIZAR", "CALL DEMO", "QUENTE")
2. **Lista de conversas:** abas Não lidos (com contador) | Todos | Recentes | Marcados (estrela); filtros e ordenação com badges; checkbox "Selecionar tudo" (ações em massa)
3. **Thread da conversa**
4. **Painel lateral de detalhes do contato**

### 4.4 Item da lista de conversas
Avatar com iniciais + mini-ícone do canal, nome, **pílula vermelha de SLA** (tempo sem resposta: "-16d", "-2h"), badge azul de não lidas, prévia da última mensagem, estrela de favorito, checkbox.

### 4.5 Ordenação
Mais recentes/antigas (todas as mensagens), mais recentes/antigas (mensagens manuais), **maior atraso de SLA**, **próxima meta de SLA**.

### 4.6 Filtros (drawer lateral)
Linhas de condição campo + operador + valor (ex. Tag É "assinante"), combináveis com **E/OU**, botão Limpar.

### 4.7 Thread da conversa
- Cabeçalho: avatar, nome, pílula SLA com dropdown, botão **"Call" via WhatsApp**, dropdowns de canal de chamada/atribuição de atendente, estrela, marcar lido/não lido, excluir conversa
- Bolhas com horário e menu por mensagem; **player de áudio nativo** (waveform, velocidade 1x, volume, download)
- Separadores de data
- **Eventos de pipeline inline no thread** (ex. "Opportunity movida de NEGOCIANDO → ASSINOU", com link "Detalhes")

### 4.8 Composer (caixa de mensagem)
- Seletor de canal: SMS | WhatsApp | E-mail | canais custom + aba **"Comentário Interno"** (nota invisível ao lead)
- Toolbar: emoji, trechos/templates, tradução/idioma, canais Meta, anexo, seletor de remetente, atribuição, **gravar áudio**, documento/nota, automação rápida (raio), tag, **cobrança/$**, limpar
- Modo e-mail: De (editável), De nome, Para, Assunto, corpo rich-text com formatação, link, anexo, template, imagem
- **Agendamento de mensagem:** modal com data, hora, fuso horário, botões Limpar/Programar (qualquer canal)
- Minimizar/expandir composer

### 4.9 Painel lateral direito do contato (rail de ícones alterna painéis)
- **Compromissos:** busca por calendário, abas Futuro/Passado, + Adicionar
- **Campos do contato:** abas "Todos os campos" | "DND" (Do Not Disturb/opt-out) | "Ações"; busca de campos/pastas; accordion "Contato" (Nome, Sobrenome, E-mail, Telefone com bandeira, Data de nascimento) + **campos personalizados ilimitados** (ex.: Tipo de Negócio, Interesse com CRM, Status de Assinatura...); proprietário, usuário atribuído, seguidores
- **Aba Ações:** cartões de **oportunidades do contato** (pipeline > fase, valor, status, proprietário) + **fluxos de trabalho ativos** (em quais automações o lead está/passou)
- **Tarefas:** busca, + Adicionar
- **Observações (notas):** busca, + Adicionar
- **Compromissos** (calendário)
- **Arquivos:** abas Todos | Interno | Enviado | Recebido; anexar contratos/documentos
- **Pagamentos/faturas** e **IA** (ícones do rail)
- Histórico/atividade recente

---

## 5. Calendários

- Abas: Visualização de calendário | Visualização da lista de compromissos | Configurações
- Vista semanal/dia/mês com navegação de período, linha do horário atual, eventos all-day
- **Sincronização bidirecional com Google Calendar** (eventos "Busy", intervalos bloqueados, eventos recorrentes, ícone de origem Google)
- Seletor de calendário (ex. "Reuniões"); **cada usuário com seu próprio calendário**
- Tooltip de evento com origem, tipo e recorrência
- Automações de lembrete de reunião via WhatsApp (ex. 1 dia antes, 10 min antes)

---

## 6. Contatos

### 6.1 Sub-abas
Contatos | Listas inteligentes | Ações em massa | Tarefas | Empresas | Configurações

### 6.2 Lista
- Contador total (ex. "6466 Contatos") — **ilimitados**
- **Listas inteligentes** (segmentos/filtros salvos): aba "Todos" + "+ Adicionar lista inteligente"
- Toolbar: Filtros avançados, Ordenar, busca, **Gerenciar campos** (colunas visíveis), Importar, + Adicionar Contato, kebab (exportar etc.)
- Colunas ordenáveis: Nome (avatar), Telefone, E-mail, Nome comercial, Criado, Última atividade (com ícone do canal), Tags

### 6.3 Ações em massa
Barra contextual ao selecionar ("X selecionados" + **"Selecionar todos N"** da base inteira):
- Enviar SMS / Enviar e-mail / Enviar WhatsApp
- Solicitar avaliações (reviews)
- Gerenciar empresas / Gerenciar oportunidades
- **Acionar automação** (disparar workflow)
- Adicionar tags / Remover tags
- Exportar / **Mesclar (merge de duplicados)** / Excluir

### 6.4 Importação
Import CSV em massa (20–50 mil contatos citados).

### 6.5 Filtros avançados (drawer)
- Dados do contato: cidade, CEP, criado, criado por, data de nascimento, e-mail, nome, empresa, país, **proprietário**, rua, **seguidores**, site, status do e-mail...
- Engajamento: data de abertura/clique do último e-mail
- **Atribuição de marketing completa:** UTM (campanha, anúncio, grupo de anúncio, meio, palavra-chave, termo), fbclid, gclid, primeira/última atribuição, tipo de correspondência

---

## 7. Leads (Pipelines / Oportunidades)

### 7.1 Sub-abas
Leads | Pipelines (gestão/edição) | Ações em massa

### 7.2 Kanban
- Seletor de pipeline (nomes com emoji, ex. "✅ CONTROLE DE LEADS") + contador de leads
- Views: kanban ("Oportunidades") | Lista | **"+" para criar novas views**
- Toolbar: Filtros avançados, Classificar, busca, Gerenciar campos, Importar oportunidades, + Adicionar oportunidade
- Colunas (fases): nome, contagem, **soma monetária**, cor por fase, **colapsar/expandir** (vira faixa vertical)
- Pipeline demonstrado: NOVO LEAD → NEGOCIANDO → QUENTE 🔥 → TESTE GRÁTIS → FINALIZOU TESTE → ASSINOU → FILA DEMO → CALL DEMO → PERDIDO
- **Drag & drop** de cards entre fases

### 7.3 Card de oportunidade
Nome, avatar do proprietário (ou "não atribuído +"), **Fonte** (origem), **Valor**, checkbox no hover, fileira de **quick actions com badges**: ligar, conversa/mensagens, tags, notas, adicionar tarefa, agendar compromisso.

### 7.4 Automações de pipeline (regras demonstradas)
- Lead respondeu → move para "Negociando" + **atribui a um SDR**
- Sem resposta após X tempo → follow-up automático → move para "Perdido"
- Ao mover para fase (ex. "Assinou") → dispara mensagem de boas-vindas
- Pipelines, fases e oportunidades **ilimitados**

---

## 8. Pagamentos

### 8.1 Sub-abas
Pagamentos | Faturas e estimativas ▾ | Arquivos e contratos ▾ | Pedidos ▾ | Assinaturas (recorrência) | Links de pagamento | Vendas | Produtos ▾ | Cupons | Gift Cards | Configurações | Integrações

### 8.2 Integrações de pagamento
Stripe, PayPal, Mercado Pago (citado), Authorize.net, NMI, Square, Adyen, **Métodos manuais/offline**. Seções "Conectado" e "Mais provedores" com botão Conectar.

### 8.3 Documentos e contratos (Propostas, Estimativas e Contratos)
- Templates ("Modelos") + documentos
- **Fluxo de assinatura eletrônica:** abas de status com contadores — Rascunho | Aguardando por outros | Concluído | Pagamentos | Arquivado
- Tabela: Título, Status, Cliente, Data de modificação, **Valor** (pagamento vinculado ao documento)
- Filtro por intervalo de datas + busca, botão "+ Novo"

---

## 9. Agentes de IA / AI Studio

### 9.1 Sub-abas
Começando | AI de voz (Voice AI) | Conversation AI | Base de Conhecimento | Modelos de agente | Content AI | Agent Logs

### 9.2 Conversation AI — Painel
- KPIs: contatos únicos, ações acionadas, compromissos agendados, **tempo economizado**, total de mensagens, média de mensagens/contato (com comparação % vs mês anterior)
- Filtros: canal, período, agente; gráfico temporal; tabela de conversas

### 9.3 Lista de agentes
- Múltiplos bots; conceito de **agente Principal** (só ele responde mensagens recebidas)
- Status: Sugestivo (modo sugestão) / Desativado; canais compatíveis por agente (SMS, WhatsApp...)

### 9.4 Configuração do bot
- Abas: Configurações do bot | Treinamento do bot | Metas do bot | Painel
- **Painel de teste embutido** (chat para testar o bot antes de publicar, com reset)
- Seletor de modelo LLM (ex. "OpenAI GPT 4.1") + configurações; contador de tokens e palavras restantes
- **Três prompts obrigatórios:** Personalidade | Meta | Informações adicionais (com inserção de valores personalizados/merge fields)
- **Ações configuráveis do bot** (chips com badge de nº de regras):
  - Agendamento de compromissos
  - Acionar um fluxo de trabalho (workflow)
  - **Informações de contato** (IA pergunta e atualiza campos do contato automaticamente)
  - Parar bot
  - **Transferência humana** (por motivo/condição)
  - Transferir para outro bot
  - Acompanhamento automático (follow-up)
- Preferências: resumo da conversa (toggle)
- Base de conhecimento gerenciável; logs de agente

---

## 10. Marketing

### 10.1 Sub-abas
Planejador Social | E-mails (e-mail marketing) | Trechos | Temporizadores de contagem regressiva | Links de acionamento | Affiliate Manager ▾ | Brand Boards | Gerenciador de anúncios

### 10.2 Planejador Social
Sub-abas internas: Planejador | Conteúdo | Comentários | Estatísticas | Escuta de redes sociais | Configurações

**Redes conectáveis:** Facebook, Instagram, Google Business Profile, LinkedIn, TikTok, YouTube, Pinterest, Threads, Bluesky, Communities — sem limite de contas.

- **Planejador (lista):** tabela de publicações (legenda, mídia, status Publicado/Rascunho, tipo, data, rede), filtros por visualização/data/conta, grupos de contas, busca por legenda
- **Planejador (calendário):** vista mensal/semanal de posts agendados
- **Conteúdo:** importação CSV em massa, posts **recorrentes**, avaliação, **RSS**, biblioteca de modelos, **fluxo de aprovação**, fila de categoria
- **Comentários:** inbox unificado de comentários por canal (FB, IG, LinkedIn, TikTok...), filtros por conta/data/palavra
- **Estatísticas:** dashboard de desempenho por rede (KPIs + gráficos)
- **Escuta social (social listening):** cards de tendências — Google Trends, palavras-chave do Pinterest, Wikipédia pageviews, músicas e hashtags do TikTok

### 10.3 Gerenciador de anúncios
Criação e gerenciamento de campanhas embutido ("como a BM do Facebook"), com wizard de conexão de conta de anúncios.

---

## 11. Automações (Workflows) — "o cérebro do CRM"

### 11.1 Lista de fluxos
- Abas: Fluxos de trabalho | Configurações globais
- Botões: Criar pasta | **"Construa usando IA"** | + Criar fluxo de trabalho
- Criação: do zero | com IA | **a partir de modelo (templates)** | importar de campanha | baseado em Company
- Organização em **pastas**; listas inteligentes; filtros avançados; busca
- Tabela: Nome, Status (Published/Draft), **Total de inscritos, Inscritos ativos**, última atualização, criado em, estatísticas

### 11.2 Builder visual
- Canvas com grid, nós Trigger → Ações → FIM, conectores "+"
- **Geração de workflow por IA** (textarea de prompt com sugestões, microfone)
- Abas: Construtor | Configurações | **Histórico de inscrições** | **Registros de execução**
- Testar fluxo de trabalho; toggle Rascunho/Publicar; salvo automático; undo/redo; zoom/pan/minimapa

### 11.3 Acionadores (triggers) observados
Etapa do funil alterada; Tag de contato; **Cliente respondeu**; Compromisso agendado; Contato criado; Lembrete de aniversário; Contato alterado; Contato com DND; + abas de triggers de **Apps** de terceiros. (Narração: responder comentários do Instagram, DM automática — automações estilo ManyChat.)

### 11.4 Ações observadas (por categoria)
- **Contato:** criar/encontrar/atualizar contato, adicionar/remover tag, atribuir/remover usuário, DND, notas, copiar contato, editar conversa, adicionar tarefa, excluir contato, score de engajamento, seguidores, merge
- **Oportunidade:** criar/atualizar oportunidade, remover oportunidade
- **Comunicação (narrado):** enviar mensagem (WhatsApp/SMS), enviar e-mail
- **Marketing:** Google Analytics, Google Ads, Facebook públicos personalizados (adicionar/remover), **API de conversão da Meta** (enviar evento de lead qualificado para otimizar anúncio), relatório de auditoria de marketing
- **Afiliados:** adicionar ao affiliate manager, atualizar afiliado, campanha de afiliados
- **Lógica interna:** If/Else, Esperar (wait), Evento de meta (goal), **Split test**, atualizar valor personalizado, Ir para (go to), formatadores (data/número/texto/array), operação matemática, drip (liberação contínua), adicionar/remover de workflow
- **Premium:** Webhook personalizado, Google Sheets, Código personalizado
- **IA:** AI translate, AI summarize, AI intent detection, AI decision maker, Agente de IA no fluxo, GPT (OpenAI)
- **Certificados:** emitir certificado
- **Agent Studio:** invocar agente

---

## 12. Sites

Sub-abas: **Funis | Sites | Lojas (e-commerce) | Webinars | Analytics | Blogs | WordPress | Portal do cliente | Formulários | Pesquisas (surveys) | Testes (quizzes) | Widget de chat | Códigos QR | Configurações**

- **Domínio próprio** conectável
- **Funis:** criação/gestão de funis de venda (páginas, etapas, pagamentos)
- **Formulários:** builder, analíticos, envios (submissions)
- Sites completos, blogs, lojas, webinars, quizzes, pesquisas, widget de chat para site, QR codes

---

## 13. Assinaturas (Memberships / Produtos digitais)

Sub-abas: Portal do cliente ▾ | Cursos ▾ | Comunidades ▾ | Certificado | Marketplace (Gokollab)

- **Área de membros para cursos/treinamentos** (produto digital)
- **Comunidade** para alunos
- **Portal do cliente:** URL própria (subdomínio), login para acessar cursos e pagamentos de afiliados; métricas (convidados, usuários); ações: **gerar link mágico** (login sem senha), convidar, enviar e-mail de login
- **App mobile white-label** ("Sua marca. Seu app.") para cursos e comunidades
- Certificados de conclusão

---

## 14. Mídia Drive

- Biblioteca de mídia central ("Armazenamento de mídia") com indicador de uso (ex. 14,09 GB)
- **Integração com Canva** (botão Conectar Canva) e Google Drive (narrado) — atalho para não sair do CRM
- Upload (com dropdown), criação de pastas, geração de mídia por IA
- Busca com **banco de imagens (stock)**; filtros por tipo e data; visualização grade/lista
- Suporta vídeo, imagem, documentos/CSV

---

## 15. Reputação

Sub-abas: Visão geral | Solicitações | Avaliações | Depoimentos em vídeo | Widgets | Listagens | Configurações

- **Coleta e gestão de avaliações** de dezenas de plataformas (Google Business Profile, Facebook, Booking, Airbnb, Amazon, Capterra, Glassdoor, TripAdvisor-likes etc.) — conectar conta por plataforma, importar avaliações por link
- Configurações: **IA de avaliações** (respostas automáticas), link de avaliação, solicitações por SMS/E-mail/WhatsApp, avaliações via QR, filtro de spam, integrações, links personalizados
- Widgets de avaliações para embutir em sites; depoimentos em vídeo; listagens (presença em diretórios)

---

## 16. Relatórios

Sub-abas: Relatórios personalizados | Google Ads | Anúncios Meta (Facebook) | Relatório de atribuição | Relatório de ligações | Relatório de agente | Relatório de compromissos | Auditoria de Marketing Local

- **Relatórios personalizados** com **agendamento de envio** (frequência de programação) e templates
- **Google Ads / Meta Ads:** integração da conta; gráficos de impressões/cliques/conversões; KPIs (gasto, CPC médio, custo por conversão, taxa de conversão); tabela de campanhas com colunas configuráveis (cliques, custo, receita, ROI%, CPC, CTR, vendas, leads, CPL, impressões)
- Atribuição, ligações, desempenho de agentes/atendentes, compromissos

---

## 17. Apps do Marketplace

- **1505 apps em 72 páginas** — integrações instaláveis na conta
- Filtros: coleções, categorias, conteúdo do app, nicho, desenvolvedor, precificação
- Cards com rating/reviews e preço (maioria gratuito)
- Exemplos: Canva, CloseBot, Zoom, Kixie PowerCall & SMS, WhatsApp ChatBot, Appointwise, Twilio, WooCommerce, Telegram ChatBot

---

## 18. WhatsApp

### 18.1 API Não Oficial (QR Code)
- Tela de **instâncias** (múltiplos números via QR Code), cada card com nome, foto, número, status conectado/desconectado, numeração (#1, #2...)
- Vinculada à location/subconta

### 18.2 API Oficial (Meta / Cloud API)
- Abas: WhatsApp Business | Números | Modelos | Fluxos | Ligando
- **Números:** status da conta (Aprovado, verificação de negócio Meta, mensagens de marketing habilitadas), gerenciar/adicionar números, **classificação de qualidade** (verde), anúncio de engajamento
- **Modelos (templates):** criar/gerenciar templates com variáveis `{{1}}`, idioma, categoria (Marketing/Utility), status de aprovação, pastas
- Custos: taxa da Meta (~US$ 11) + custo por template aprovado

---

## 19. Usuários, Funções e Permissões

- **Usuários ilimitados sem custo por assento** (diferencial declarado)
- Lista da equipe: nome, e-mail, telefone, tipo (ACCOUNT-ADMIN / ACCOUNT-USER), ações (editar, excluir, reenviar convite)
- Formulário do usuário (seções): Informações (foto 512×512, nome, sobrenome, e-mail, telefone, ramal, **assinatura de mensagens** com toggle) | **Funções & Permissões** | Configurações de chamadas e correio de voz | Disponibilidade | Configuração de calendário
- Funções: **Administrador / Usuário**
- **"Limitar visibilidade apenas a dados atribuídos"** — o usuário só vê conversas/leads atribuídos a ele
- **Permissões granulares por módulo** (toggle master + checkboxes): AI Agents, auditoria, configurações da conta, AI Studio, automação, blogs, calendários, certificados, comunidades, contatos, conversas, formulários, funis etc.
- **Copiar permissões** entre usuários
- Registros de auditoria (visualizar/exportar)

---

## 20. Configurações

Três grupos no menu:

- **MINHA EMPRESA:** Perfil da empresa | Meu perfil | Faturamento | Minha equipe | Leads & Pipelines
- **EMPRESARIAIS:** Calendários | Email Services | **Sistema telefônico (VoIP)** | WhatsApp
- **CONFIGURAÇÕES:** Objetos (custom objects) | Campos personalizados | Valores personalizados | Importar dados | Gerenciar pontuação (lead scoring) | Hub de gerenciamento | Domínios e redirecionamentos | Rastreamento externo | Integrações | Integrações privadas

### Telefonia / VoIP
- **Webphone/discador embutido** (painel flutuante): seletor de número de origem, teclado, abas Recentes | Contatos | Teclado | Correio de voz | Fila
- Ligações VoIP dentro do CRM

---

## 21. Onboarding, Suporte e Treinamento

### Checklist de Ativação (tela custom, dark)
- Progresso: "X de 6 passos", % de ativação, próximo passo
- Passos (accordions com "Marcar como concluída" e vídeos embutidos):
  0. Baixar o app (iOS, Android, macOS, Windows)
  1. Configurações da empresa (nome, logo, idioma, endereço, usuários/permissões)
  2. Integrar Facebook e Instagram
  3. Conectar WhatsApp
  4. Criar o pipeline (funil comercial)
  5. Automação de entrada de lead
  6. Automação de follow-up
- Card "Custos adicionais" (WhatsApp, ligações, disparos) com artigo

### Suporte
- Botão "Suporte" no topbar → widget de chat in-app (assistente virtual + equipe humana); suporte via WhatsApp

### Treinamento e serviços (modelo de negócio)
- Programa de treinamento com aulas iniciais (5–10 min)
- **40 videoaulas avançadas**
- **Pasta de automações prontas** (abrir, editar, usar)
- **Planos de implementação a partir de R$ 2.000:** jornada de 45 dias (15 dias de montagem + 30 dias de treinamento da equipe), entrega do sistema pronto
- Venda assistida por SDR via WhatsApp

---

## 22. Padrões de UI transversais (para reconstrução)

- **Layout:** sidebar fixa escura (~140–180 px) + topbar preta + submenu horizontal por módulo (abas com underline) + conteúdo claro em cards arredondados
- **Cores:** azul primário (~#2563eb) para CTAs; roxo para destaques de IA e item ativo; verde para WhatsApp/status positivo; vermelho para SLA/alertas; verde-limão nas telas custom (onboarding/suporte)
- **Tabelas:** colunas ordenáveis e configuráveis, checkbox + barra de ações em massa contextual, kebab por linha, paginação, busca e filtros ("Add filter"/"Ordenar")
- **Drawers laterais** para filtros avançados; **modais** para agendamentos/conexões
- **Empty states** padronizados: ícone + título + texto + CTA
- **KPI cards** com comparação percentual vs período anterior (setas ▲▼)
- **Tooltips** informativos (ⓘ) em cabeçalhos e chips
- **Padrão de painel lateral:** título + "+ Adicionar" + X + busca + abas + empty state
- Timezone explícito nas datas "(-03)"; dois temas coexistem (produto light / onboarding dark)

---

## 23. Resumo — capacidades por domínio

| Domínio | Capacidades-chave |
|---|---|
| CRM core | Contatos ilimitados, campos/objetos custom, smart lists, merge, import/export massivo, lead scoring |
| Vendas | Pipelines kanban ilimitados, oportunidades, automação de fases, atribuição a SDR |
| Atendimento | Inbox omnichannel (WA oficial/não oficial, IG, FB, TikTok, SMS, e-mail), SLA, views salvas, notas internas, agendamento de mensagens |
| Telefonia | VoIP/webphone, chamadas via WhatsApp, correio de voz, fila |
| IA | Bots conversacionais (3 prompts), ações de IA, voice AI, base de conhecimento, IA em workflows, geração de workflow por IA |
| Automação | Builder visual de workflows com dezenas de triggers/ações, pastas, templates, split test, webhooks, código custom |
| Marketing | Social planner multi-rede, inbox de comentários, social listening, e-mail marketing, gerenciador de anúncios, afiliados |
| Web | Funis, sites, blogs, lojas, formulários, quizzes, pesquisas, webinars, widget de chat, domínio próprio |
| Financeiro | Provedores de pagamento, faturas, links de pagamento, produtos, cupons, assinaturas recorrentes, contratos com assinatura eletrônica |
| Educação | Cursos, comunidades, certificados, portal do cliente, app white-label |
| Reputação | Coleta de reviews multi-plataforma, solicitações por SMS/e-mail/WA, widgets, IA de resposta |
| Analytics | Dashboards custom compartilháveis, relatórios agendados, Google/Meta Ads, atribuição UTM completa |
| Plataforma | Multi-tenant (subcontas), usuários ilimitados, permissões granulares, auditoria, marketplace de apps, apps mobile/desktop |
