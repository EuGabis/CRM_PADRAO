-- ============================================================
-- 0049 — Motivo visível quando o motor pausa uma campanha sozinho
--
-- O motor (src/lib/marketing/engine.ts) passou a recusar campanha de empresa
-- com o módulo `marketing` bloqueado no plano. Sem um lugar para gravar o
-- motivo, a campanha simplesmente parava em 'paused' e o admin do cliente não
-- tinha como saber por quê (a tela mostra só o status).
--
-- Coluna livre, preenchida pelo motor (service role) e limpa quando alguém
-- retoma a campanha pela tela.
-- ============================================================

alter table public.email_campaigns
  add column if not exists pause_reason text;

comment on column public.email_campaigns.pause_reason is
  'Motivo legível da última pausa automática (ex.: módulo bloqueado no plano). Null quando a campanha está rodando normalmente.';
