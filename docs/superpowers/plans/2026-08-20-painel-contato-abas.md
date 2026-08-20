# Painel do contato: Observações, Tarefas, Compromissos, Arquivos — plano

> Executado por subagentes, uma aba por vez, revisão entre cada.

**Goal:** as quatro abas do `ContactPanel` (hoje stubs com "chega com o backend") passam a funcionar, escopadas por contato; tarefa e compromisso são a mesma tabela `appointments` e aparecem no Calendário.

**Decisões (do dono):**
- Tarefa = compromisso com rótulo (`kind`) e `done`. Mesma tabela `appointments`, então aparece no Calendário. Sem tabela paralela.
- Compromissos reusam `appointmentActions` (`src/lib/data/repos/db/appointments.ts`) — a mesma que a tela de Calendários usa. Nada novo, só filtrar por contato.
- Observações: tabela nova `contact_notes`.
- Arquivos: tabela nova `contact_files` + bucket privado (reusa o padrão de `conversation-media`).

## Global Constraints

- **Toda linha é por empresa e por contato.** RLS multi-tenant `TO authenticated` checando membership via `private.user_locations()`, como toda tabela de domínio. Cada consulta do painel filtra por `contact_id` — nunca mistura contatos.
- **Migrações idempotentes**, aplicadas à mão no SQL Editor, registradas em `scripts/gerar-setup.ps1`. **Próximo número livre: confira `AGENTS.md` e `ls supabase/migrations/`.**
- **Base UI, não Radix.** **Zustand**: nunca filtrar/mapear/criar objeto dentro de selector — trava a página.
- **Coluna secreta**: nenhuma aqui. Mas ao dar `grant`, siga o padrão da `0058` (nunca `select("*")` em tabela com segredo — não é o caso destas, mas mantenha lista explícita de colunas nas queries).
- **Storage**: arquivos vão para bucket privado, caminho `{location_id}/{contact_id}/{uuid}.{ext}`, política por primeiro segmento = location_id (padrão da `0019`).
- Texto de UI em pt-BR. Commits em português. Commit + push na `main` a cada tarefa.
- O projeto NÃO tem test runner. Verificação: `npx tsc --noEmit` e `npm run build`.
- Não rode `dev` e `build` juntos. PowerShell 5.1 (`&&` não existe).

## Task 1 — Migração: tarefas em appointments + contact_notes + contact_files

- Acrescentar a `appointments`: `kind text not null default 'compromisso' check (kind in ('compromisso','tarefa'))` e `done boolean not null default false`.
- Criar `contact_notes` (id, location_id, contact_id, body text, created_by, created_at) com RLS multi-tenant.
- Criar `contact_files` (id, location_id, contact_id, storage_path, file_name, file_mime, file_size bigint, uploaded_by, created_at) com RLS multi-tenant.
- Criar bucket privado `contact-files` com políticas por primeiro segmento = location_id (espelhar `0019`), com `file_size_limit`.
- Registrar em `gerar-setup.ps1`, regerar setup, atualizar "próximo número livre" no `AGENTS.md`.

## Task 2 — Aba Observações

- Repo `db/contact-notes.ts`: `useContactNotes(contactId)`, `add(contactId, body)`, `remove(id)`. Sempre filtrando `location_id` + `contact_id`.
- No `ContactPanel`, painel `notas`: lista as observações do contato (mais recente no topo), campo para escrever + botão adicionar, apagar. Mostra autor e data.
- Falha nunca some com o texto que o usuário digitou sem avisar.

## Task 3 — Aba Compromissos

- No `ContactPanel`, painel `compromissos`: lista os `appointments` do contato com `kind = 'compromisso'`, ordenados por `starts_at`. Formulário para criar (título, início, fim, calendário, lembrete) chamando `appointmentActions.add` com `contact_id` preenchido — o mesmo que o Calendário usa, então aparece lá.
- Reusar `appointmentActions`; estender só se faltar filtro por contato.

## Task 4 — Aba Tarefas

- Mesma tabela, `kind = 'tarefa'`. Painel `tarefas`: lista as tarefas do contato, checkbox de concluída (`done`), criar tarefa (título, data/hora, lembrete). Concluir marca `done` sem apagar.
- Garantir que a tela de Calendários não quebre com as linhas `kind='tarefa'` — decidir se as mostra (com estilo próprio) ou filtra. Preferência: mostrar, distinguindo visualmente.

## Task 5 — Aba Arquivos

- Repo `db/contact-files.ts`: `useContactFiles(contactId)`, `upload(contactId, file)` (sobe ao bucket + grava linha), `remove(id)` (apaga do bucket + linha), `signedUrl(path)` para baixar/ver.
- Painel `arquivos`: lista, upload, download por URL assinada de curta duração, remover. Limite de tamanho como no `media-limits`.
- Nunca logar conteúdo, nome de arquivo do cliente ou URL assinada.

## Verificação final (Gabriel)

Aplicar a migração. Em um contato: escrever uma observação; criar um compromisso e vê-lo no Calendário; criar uma tarefa, concluí-la, e vê-la no Calendário; subir e baixar um arquivo. Confirmar que abrir OUTRO contato mostra dados diferentes (isolamento por contato).
