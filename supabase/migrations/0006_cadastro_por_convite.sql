-- ============================================================
-- CRM ON — Cadastro apenas por convite
--
-- O bloqueio acontece no trigger de criação de usuário: sem convite
-- pendente, a transação é abortada e a conta NÃO é criada — vale
-- inclusive para quem chamar a API de auth diretamente.
--
-- Para reabrir o cadastro público no futuro:
--   update private.app_settings set signup_mode = 'open';
-- Para fechar de novo:
--   update private.app_settings set signup_mode = 'invite_only';
-- ============================================================

set check_function_bodies = off;

-- Configuração global (schema privado — não exposto pela API)
create table if not exists private.app_settings (
  id boolean primary key default true check (id),
  signup_mode text not null default 'invite_only'
    check (signup_mode in ('invite_only', 'open')),
  updated_at timestamptz not null default now()
);

insert into private.app_settings (id) values (true) on conflict (id) do nothing;

-- Garante o modo fechado ao aplicar esta migração
update private.app_settings set signup_mode = 'invite_only', updated_at = now();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  mode text;
  loc uuid;
  pipe uuid;
begin
  select * into invite
  from public.invitations
  where status = 'pending' and lower(email) = lower(new.email)
  order by created_at
  limit 1;

  -- Sem convite: só continua se o cadastro público estiver liberado
  if not found then
    select signup_mode into mode from private.app_settings where id;
    if coalesce(mode, 'invite_only') = 'invite_only' then
      raise exception 'Cadastro apenas por convite'
        using errcode = '42501',
              hint = 'Peça um convite ao administrador da empresa.';
    end if;
  end if;

  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );

  -- Convidado: entra na empresa que convidou
  if invite.id is not null then
    insert into public.location_members (location_id, user_id, role, only_assigned, permissions)
    values (invite.location_id, new.id, invite.role, invite.only_assigned, invite.permissions)
    on conflict (location_id, user_id) do nothing;

    update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

    return new;
  end if;

  -- Cadastro público (quando liberado): cria a própria empresa
  insert into public.locations (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'company', ''), 'Minha empresa'))
  returning id into loc;

  insert into public.location_members (location_id, user_id, role)
  values (loc, new.id, 'admin');

  insert into public.pipelines (location_id, name, position)
  values (loc, '✅ Controle de Leads', 0)
  returning id into pipe;

  insert into public.stages (location_id, pipeline_id, name, color, position)
  values
    (loc, pipe, 'NOVO LEAD', '#94a3b8', 0),
    (loc, pipe, 'NEGOCIANDO', '#3b82f6', 1),
    (loc, pipe, 'QUENTE 🔥', '#f43f5e', 2),
    (loc, pipe, 'TESTE GRÁTIS', '#f59e0b', 3),
    (loc, pipe, 'FINALIZOU TESTE', '#ec4899', 4),
    (loc, pipe, 'ASSINOU', '#22c55e', 5),
    (loc, pipe, 'FILA DEMO', '#94a3b8', 6),
    (loc, pipe, 'CALL DEMO', '#64748b', 7),
    (loc, pipe, 'PERDIDO', '#ef4444', 8);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
