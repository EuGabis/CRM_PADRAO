-- ============================================================
-- Lito CRM — Motor de automações (schema + captura de eventos)
-- Migração única: rode este arquivo inteiro de uma vez no SQL Editor.
-- ============================================================
set check_function_bodies = off;

-- ---------- Configuração dos workflows ----------
alter table public.workflows
  add column if not exists trigger_key text,
  add column if not exists trigger_config jsonb not null default '{}',
  add column if not exists steps jsonb not null default '[]';

-- ---------- Fila de execuções ----------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'waiting', 'done', 'failed', 'cancelled')),
  current_step int not null default 0,
  next_run_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  attempts int not null default 0,
  last_error text,
  event_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- idempotência: o mesmo evento não gera dois runs
create unique index if not exists automation_runs_event_key_uniq
  on public.automation_runs (event_key) where event_key is not null;
create index if not exists automation_runs_due_idx
  on public.automation_runs (status, next_run_at);
create index if not exists automation_runs_location_idx
  on public.automation_runs (location_id, created_at desc);
create index if not exists automation_runs_workflow_idx
  on public.automation_runs (workflow_id, created_at desc);

-- ---------- Log passo a passo ----------
create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  run_id uuid not null references public.automation_runs (id) on delete cascade,
  step_index int not null,
  action_key text not null,
  status text not null check (status in ('ok', 'skipped', 'error')),
  message text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists automation_logs_run_idx
  on public.automation_logs (run_id, step_index);

-- ---------- RLS ----------
alter table public.automation_runs enable row level security;
alter table public.automation_logs enable row level security;
revoke all on public.automation_runs, public.automation_logs from anon;

drop policy if exists "membros leem" on public.automation_runs;
create policy "membros leem" on public.automation_runs
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.automation_runs;
create policy "membros excluem" on public.automation_runs
  for delete to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros leem" on public.automation_logs;
create policy "membros leem" on public.automation_logs
  for select to authenticated
  using (location_id in (select private.user_locations()));

-- ---------- Enfileiramento (usado por todos os triggers) ----------
-- Cria um run por workflow publicado que escute o gatilho.
-- Protege contra loop: mesmo workflow + contato nos últimos 5 minutos é ignorado.
create or replace function private.enqueue_automation(
  p_trigger_key text,
  p_location_id uuid,
  p_contact_id uuid,
  p_opportunity_id uuid,
  p_payload jsonb,
  p_event_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wf record;
begin
  if p_location_id is null then
    return;
  end if;

  for wf in
    select id from public.workflows
    where location_id = p_location_id
      and status = 'published'
      and trigger_key = p_trigger_key
  loop
    if exists (
      select 1 from public.automation_runs r
      where r.workflow_id = wf.id
        and r.contact_id is not distinct from p_contact_id
        and r.created_at > now() - interval '5 minutes'
    ) then
      continue;
    end if;

    insert into public.automation_runs
      (location_id, workflow_id, contact_id, opportunity_id, payload, event_key)
    values
      (p_location_id, wf.id, p_contact_id, p_opportunity_id, coalesce(p_payload, '{}'::jsonb),
       p_event_key || ':' || wf.id::text)
    on conflict (event_key) do nothing;
  end loop;
end;
$$;

revoke all on function private.enqueue_automation(text, uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;


-- ============================================================
-- PARTE 2 — Triggers que alimentam a fila
-- ============================================================


-- ---------- Contatos ----------
create or replace function private.on_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added_tags text[];
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation(
      'contato-criado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id),
      'contato-criado:' || new.id::text
    );
    return new;
  end if;

  -- tags que passaram a existir nesta atualização
  select array(
    select unnest(coalesce(new.tags, '{}'))
    except
    select unnest(coalesce(old.tags, '{}'))
  ) into added_tags;

  if coalesce(array_length(added_tags, 1), 0) > 0 then
    perform private.enqueue_automation(
      'tag-adicionada', new.location_id, new.id, null,
      jsonb_build_object('tags', to_jsonb(added_tags)),
      'tag:' || new.id::text || ':' || array_to_string(added_tags, ',')
        || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  if new.custom_fields is distinct from old.custom_fields
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.company is distinct from old.company then
    perform private.enqueue_automation(
      'contato-atualizado', new.location_id, new.id, null,
      jsonb_build_object('contact_id', new.id),
      'contato-upd:' || new.id::text || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_automation on public.contacts;
create trigger contacts_automation
  after insert or update on public.contacts
  for each row execute function private.on_contact_change();

-- ---------- Oportunidades ----------
create or replace function private.on_opportunity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    perform private.enqueue_automation(
      'oportunidade-criada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('stage_id', new.stage_id, 'pipeline_id', new.pipeline_id,
                         'value', new.value),
      'op-criada:' || new.id::text
    );
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    perform private.enqueue_automation(
      'fase-alterada', new.location_id, new.contact_id, new.id,
      jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id,
                         'pipeline_id', new.pipeline_id),
      'fase:' || new.id::text || ':' || new.stage_id::text
        || ':' || extract(epoch from now())::bigint::text
    );
  end if;

  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform private.enqueue_automation(
        'oportunidade-ganha', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value),
        'op-ganha:' || new.id::text
      );
    elsif new.status = 'lost' then
      perform private.enqueue_automation(
        'oportunidade-perdida', new.location_id, new.contact_id, new.id,
        jsonb_build_object('value', new.value),
        'op-perdida:' || new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunities_automation on public.opportunities;
create trigger opportunities_automation
  after insert or update on public.opportunities
  for each row execute function private.on_opportunity_change();

-- ---------- Mensagem recebida ----------
create or replace function private.on_message_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c uuid;
begin
  if new.direction <> 'in' then
    return new;
  end if;

  select contact_id into c from public.conversations where id = new.conversation_id;

  perform private.enqueue_automation(
    'cliente-respondeu', new.location_id, c, null,
    jsonb_build_object('channel', new.channel, 'body', new.body),
    'resp:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists messages_automation on public.messages;
create trigger messages_automation
  after insert on public.messages
  for each row execute function private.on_message_in();

-- ---------- Compromisso agendado ----------
create or replace function private.on_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_automation(
    'compromisso-agendado', new.location_id, new.contact_id, null,
    jsonb_build_object('starts_at', new.starts_at, 'title', new.title),
    'compromisso:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists appointments_automation on public.appointments;
create trigger appointments_automation
  after insert on public.appointments
  for each row execute function private.on_appointment_created();

-- ---------- Aniversários (verificação diária) ----------
create or replace function private.enqueue_birthdays()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  bday date;
begin
  for c in
    select id, location_id, custom_fields ->> 'Data de aniversário' as raw
    from public.contacts
    where custom_fields ? 'Data de aniversário'
      and coalesce(custom_fields ->> 'Data de aniversário', '') <> ''
  loop
    begin
      bday := c.raw::date;
    exception when others then
      continue; -- data inválida no campo personalizado: ignora este contato
    end;

    if to_char(bday, 'MM-DD') = to_char(now(), 'MM-DD') then
      perform private.enqueue_automation(
        'aniversario', c.location_id, c.id, null, '{}'::jsonb,
        'aniversario:' || c.id::text || ':' || to_char(now(), 'YYYY')
      );
    end if;
  end loop;
end;
$$;

-- 12:00 UTC = 09:00 no horário de Brasília
select cron.unschedule('lito-aniversarios')
where exists (select 1 from cron.job where jobname = 'lito-aniversarios');

select cron.schedule('lito-aniversarios', '0 12 * * *', $$select private.enqueue_birthdays()$$);
