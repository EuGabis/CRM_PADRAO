-- ============================================================
-- CRM ON — Conversas: só administrador exclui
--
-- Excluir uma conversa apaga o histórico do atendimento junto (as mensagens
-- caem por ON DELETE CASCADE) e não tem desfazer. Isso é decisão de
-- administrador, não de qualquer atendente — para tirar da vista existe
-- "Arquivar" (0029), que não destrói nada.
--
-- Esconder o botão na tela não bastaria: as policies "membros excluem" das
-- duas tabelas vêm do laço da 0001 e deixam qualquer membro apagar chamando a
-- API direto.
--
-- `messages` entra junto de propósito: sem isso um usuário comum continuaria
-- conseguindo esvaziar a conversa mensagem por mensagem — o mesmo estrago,
-- por outro caminho. (A exclusão em cascata, disparada ao apagar a conversa,
-- não passa por RLS, então o admin continua excluindo tudo normalmente.)
--
-- Idempotente: derruba tanto a policy antiga quanto a nova antes de criar.
-- ============================================================

drop policy if exists "membros excluem" on public.conversations;
drop policy if exists "admin exclui conversas" on public.conversations;
create policy "admin exclui conversas" on public.conversations
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and private.is_admin(location_id)
  );

drop policy if exists "membros excluem" on public.messages;
drop policy if exists "admin exclui mensagens" on public.messages;
create policy "admin exclui mensagens" on public.messages
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and private.is_admin(location_id)
  );
