# Leads: segmentação dos pipelines — Design Spec

> O pipeline JÁ é a forma de visualizar os leads; o que faltava era dizer de
> quem ele é. Data: 2026-08-14. Convenções: `AGENTS.md`.
> Migração: **0039** (aplicar no SQL Editor).

## Objetivo

Até aqui todo pipeline era da empresa inteira: qualquer usuário criava um funil
e ele aparecia para todo mundo. Agora o funil tem dono.

| escopo | quem vê | quem cria |
|---|---|---|
| `empresa` | todos | só admin |
| `department` | quem é do departamento (+ admin) | só admin |
| `user` | só o dono (+ admin) | qualquer um (para si) e o admin (para outra pessoa) |

**Todos os pipelines existentes viram `empresa`** (é o default da coluna), então
nada muda para os dados de hoje — o admin re-segmenta o que quiser depois, pelo
botão "Quem vê".

## Não-objetivos (v1)

- Compartilhar um pipeline com uma lista de pessoas (é um dono, um departamento,
  ou a empresa).
- Transferir em massa leads de um funil escondido para outro.
- Pipeline visível para dois departamentos.

## A regra é RLS, não tela

Sem o `with check` da policy de INSERT, qualquer usuário criaria um pipeline
`empresa` chamando a API direto. Por isso:

- **INSERT**: admin em qualquer escopo; usuário comum só `scope='user'` com
  `owner_id = auth.uid()`.
- **UPDATE**: o `with check` só deixa admin gravar um escopo que não seja "meu"
  — senão um usuário comum promoveria o próprio funil a `empresa`.
- **DELETE**: admin, ou o dono do funil pessoal.

A tela apenas evita oferecer o que o banco vai negar (usuário comum não vê o
seletor de escopo, e lê que o funil fica só para ele).

## A visibilidade contamina o que pende do pipeline

`stages` e `opportunities` de um pipeline invisível **não podem aparecer** —
senão o lead vazaria pelo dashboard, pelos relatórios ou pela API mesmo com o
funil escondido. Duas funções SECURITY DEFINER (mesmo motivo de
`private.channel_allowed`, 0035):

- `private.pipeline_visible(pipe)` — usada no SELECT de stages/opportunities.
- `private.pipeline_manageable(pipe)` — usada na escrita de stages. Admin
  sempre; o dono no escopo `user`; e **qualquer membro que enxerga** nos escopos
  `empresa`/`department`, porque era assim antes desta migração e restringir
  agora tiraria acesso de quem já organiza o próprio funil.

⚠️ As policies de `opportunities` vêm da **0004** (`private.sees_all`, "ver
apenas dados atribuídos"). A 0039 as recria **mantendo aquela condição** e
somando o filtro de pipeline. Ao mexer nelas de novo, preserve as duas.

## Peças

- `supabase/migrations/0039_pipelines_segmentacao.sql` — colunas `scope`,
  `department_id`, `owner_id`, `created_by`; check de coerência; os dois
  helpers; policies de `pipelines`, `stages` e `opportunities`.
- `src/lib/data/types.ts` — `PipelineScope` e os campos no `Pipeline`
  (opcionais: os repos mock não têm escopo).
- `src/lib/data/repos/db/pipeline.ts` — `addPipeline(name, visibility)` e
  `setPipelineScope`. O `?? "empresa"` no mapeamento cobre o intervalo entre
  subir o código e aplicar a migração.
- `src/components/pipeline/pipeline-scope-dialog.tsx` — criar/mudar quem vê.
- `src/components/pipeline/pipelines-manage-tab.tsx` — etiqueta de escopo por
  funil e o botão "Quem vê" (admin). O `window.prompt` da criação virou diálogo.

A tela de Leads **não muda**: o seletor de pipeline já lista o que a RLS
devolve, então a segmentação aparece sozinha.

## Passo manual pendente

Aplicar `0039_pipelines_segmentacao.sql` no SQL Editor. Até lá tudo funciona
como antes (todo funil é da empresa) — o seletor de escopo grava, mas as colunas
não existem e a criação falha, então **aplique antes de usar**.
