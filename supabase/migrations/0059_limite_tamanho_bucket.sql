-- ============================================================
-- CRM ON — Limite de tamanho no bucket conversation-media
--
-- O upload da mídia de saída acontece PELO BROWSER (conversations.ts,
-- sendMedia), direto na API do Storage, com o cliente autenticado da sessão
-- do usuário. Até aqui o único gate era client-side (agora por tipo, ver
-- src/lib/whatsapp/media-limits.ts) — mas gate client-side é só UX: qualquer
-- membro autenticado pode chamar a API do Storage direto (fora da nossa UI)
-- e subir um arquivo de qualquer tamanho, porque o bucket não tinha
-- `file_size_limit` e a policy de insert (0019_conversation_media.sql) só
-- valida o location_id, não o tamanho. O Storage é pago pelo dono da
-- plataforma — o `limiteExcedido` da rota de envio (send-media/route.ts) só
-- evita a chamada ao gateway da Evolution/Meta; o custo do Storage já foi
-- pago antes disso.
--
-- Usa o MAIOR teto entre os tipos (100 MB, o de documento — LIMITES.file em
-- media-limits.ts) como defesa de última linha no próprio bucket. Os tetos
-- mais apertados por tipo (5 MB imagem, 16 MB áudio/vídeo) continuam sendo
-- aplicados só na aplicação (client + rota), porque o Storage não sabe
-- classificar por tipo de mídia do WhatsApp — só por tamanho bruto.
--
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================
set check_function_bodies = off;

update storage.buckets
   set file_size_limit = 100 * 1024 * 1024 -- 100 MB, o maior teto de LIMITES em media-limits.ts
 where id = 'conversation-media';
