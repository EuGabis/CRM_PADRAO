-- ============================================================
-- Lito CRM — Guru: segredo do cron fora do código (mesmo padrão de
-- private.automation_config)
--
-- A migração 0013 tinha o x-guru-sync-secret escrito direto na definição
-- do cron.job — funciona, mas deixa um segredo real em texto puro dentro
-- de um arquivo versionado. Este arquivo corrige isso: guarda a URL e o
-- segredo numa tabela singleton em `private` (fora do PostgREST) e o
-- cron passa a chamar só `private.guru_sync_tick()`. O valor real do
-- segredo NUNCA vai num commit — é setado depois, à mão, no SQL Editor:
--
--   update private.guru_sync_config set secret = '<valor real>';
-- ============================================================
set check_function_bodies = off;

create table if not exists private.guru_sync_config (
  id boolean primary key default true check (id),
  sync_url text not null default 'https://lito-crm.vercel.app/api/integrations/guru/sync',
  secret text not null default 'troque-este-segredo'
);

insert into private.guru_sync_config (id) values (true)
  on conflict (id) do nothing;

revoke all on private.guru_sync_config from public, anon, authenticated;

create or replace function private.guru_sync_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
begin
  select * into cfg from private.guru_sync_config where id;
  if not found then
    return;
  end if;

  perform net.http_post(
    url     := cfg.sync_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-guru-sync-secret', cfg.secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function private.guru_sync_tick() from public, anon, authenticated;

select cron.unschedule('lito-guru-sync')
where exists (select 1 from cron.job where jobname = 'lito-guru-sync');

select cron.schedule(
  'lito-guru-sync',
  '* * * * *',
  $$select private.guru_sync_tick()$$
);
