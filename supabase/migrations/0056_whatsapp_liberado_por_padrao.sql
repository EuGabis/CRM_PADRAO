-- ============================================================
-- 0056 — WhatsApp deixa de nascer bloqueado
--
-- POR QUE
--
-- A 0046 fez empresa nova nascer com quatro módulos bloqueados, todos pelo
-- mesmo motivo: consomem credencial GLOBAL do dono da plataforma, então o
-- consumo de qualquer cliente cai na conta dele.
--
-- Isso continua verdade para `ai-studio`, `agentes-ia` (OPENAI_API_KEY) e
-- `marketing` (RESEND_API_KEY): são APIs MEDIDAS — cada chamada é custo
-- variável.
--
-- O WhatsApp saiu dessa categoria. Com a Evolution API, o custo é o gateway
-- próprio do dono, que é FIXO: um cliente a mais conectando usa capacidade já
-- paga, não gera cobrança nova. Manter bloqueado seria atrito sem economia.
--
-- ⚠️ RESSALVA REGISTRADA: o módulo `whatsapp` cobre os DOIS provedores. Uma
-- empresa com `location_limits.whatsapp_provider = 'meta'` e o módulo liberado
-- passa a consumir WHATSAPP_TOKEN, que É medido. O interruptor é um só; se um
-- dia isso incomodar, o caminho é separar o gate por provedor, não voltar a
-- bloquear o módulo inteiro.
-- ============================================================

create or replace function private.seed_location_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_limits (location_id, disabled_modules)
  values (new.id, '{ai-studio,agentes-ia,marketing}')
  on conflict (location_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_location_limits() from public, anon, authenticated;

-- Empresas que já existem NÃO são tocadas de propósito. Cada uma teve seus
-- módulos ajustados à mão pelo dono no painel; reescrever aqui desfaria essa
-- configuração em silêncio. Quem quiser liberar retroativamente faz pelo
-- painel, empresa por empresa, que é onde a decisão é visível.
