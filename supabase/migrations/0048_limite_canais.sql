-- ============================================================
-- 0048 — Limite de canais de WhatsApp por empresa
--
-- O insert vem direto do client Supabase (db/whatsapp.ts), então o erro
-- do trigger sobe para a UI sozinho, sem rota intermediária.
-- ============================================================

create or replace function private.enforce_channel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim   int;
  atual int;
begin
  select max_whatsapp_channels into lim
    from public.location_limits where location_id = new.location_id;

  if lim is null then
    return new;
  end if;

  select count(*) into atual
    from public.whatsapp_channels where location_id = new.location_id;

  if atual >= lim then
    raise exception 'LIMITE_CANAIS: esta empresa atingiu o limite de % numeros de WhatsApp', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_channel_limit() from public, anon, authenticated;

drop trigger if exists enforce_channel_limit_ins on public.whatsapp_channels;
create trigger enforce_channel_limit_ins
  before insert on public.whatsapp_channels
  for each row execute function private.enforce_channel_limit();
