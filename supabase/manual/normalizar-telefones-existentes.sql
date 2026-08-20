-- MANUAL (opcional): normaliza os telefones JÁ EXISTENTES para só dígitos.
--
-- O código passou a gravar telefone só com dígitos (src/lib/contacts/telefone.ts),
-- mas os contatos antigos podem estar formatados ("55 11 97400-7817"). Este
-- update deixa a base consistente, para que as próximas mensagens do WhatsApp
-- (que chegam só com dígitos) casem com o contato certo em vez de criar outro.
--
-- Só mexe no que NÃO é dígito puro; não altera o número em si (código do país,
-- 9º dígito) — só remove espaços, traços, parênteses, "+". Rode DEPOIS de
-- mesclar-contatos-por-telefone.sql: como aquele merge já fundiu os que
-- normalizam igual, tirar a formatação aqui não colide com a trava única
-- contacts(location_id, phone). Se por acaso colidir, a transação inteira é
-- desfeita (nada é aplicado) — rode o merge antes.
--
-- NÃO entra no gerar-setup.ps1 (scripts de supabase/manual/ ficam de fora).

update public.contacts
   set phone = regexp_replace(phone, '\D', '', 'g')
 where phone <> ''
   and phone !~ '^[0-9]+$';
