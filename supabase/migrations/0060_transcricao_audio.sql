-- ============================================================
-- CRM ON — Transcrição de áudio recebido.
--
-- Guarda o texto que o Whisper extraiu do áudio, na própria linha da
-- mensagem. Dois motivos, os dois importam:
--   1. o atendente lê o que o cliente disse sem precisar ouvir;
--   2. reentrega do mesmo evento pelo gateway não paga transcrição de novo
--      (a OPENAI_API_KEY é global, na conta do dono da plataforma).
--
-- Não precisa de grant: a 0058 só revogou select de TABELA em
-- whatsapp_channels e google_ads_connections. `messages` mantém o grant de
-- tabela da 0055, então a coluna nova já nasce legível por authenticated —
-- e ela não é segredo: é o conteúdo que o cliente mandou, que o atendente
-- já pode ver.
--
-- Idempotente.
-- ============================================================
alter table public.messages
  add column if not exists media_transcript text;

comment on column public.messages.media_transcript is
  'Texto extraído de áudio recebido (Whisper). Null quando não houve transcrição.';
