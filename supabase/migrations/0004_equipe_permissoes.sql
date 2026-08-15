-- ============================================================
-- CRM ON — Equipe, convites e permissões
--
-- Compatível com o que já existe: membros atuais continuam com
-- acesso total (permissions '{}' = tudo liberado, only_assigned = false).
-- ============================================================

set check_function_bodies = off;

-- ---------- 1. Permissões por membro ----------
-- '{}' significa "sem restrição" (todos os módulos liberados).
-- Chaves são os slugs dos módulos: {"pagamentos": false, "relatorios": false}
alter table public.location_members
  add column if not exists permissions jsonb not null default '{}';

-- ---------- 2. Convites ----------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  only_assigned boolean not null default false,
  permissions jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists invitations_location_idx on public.invitations (location_id);
-- Um convite pendente por e-mail/empresa
create unique index if not exists invitations_pending_unique
  on public.invitations (location_id, lower(email))
  where status = 'pending';

alter table public.invitations enable row level security;
revoke all on public.invitations from anon;

drop policy if exists "admins leem convites" on public.invitations;
create policy "admins leem convites" on public.invitations
  for select to authenticated
  using (private.is_admin(location_id));

drop policy if exists "admins criam convites" on public.invitations;
create policy "admins criam convites" on public.invitations
  for insert to authenticated
  with check (private.is_admin(location_id));

drop policy if exists "admins editam convites" on public.invitations;
create policy "admins editam convites" on public.invitations
  for update to authenticated
  using (private.is_admin(location_id))
  with check (private.is_admin(location_id));

drop policy if exists "admins excluem convites" on public.invitations;
create policy "admins excluem convites" on public.invitations
  for delete to authenticated
  using (private.is_admin(location_id));

-- ---------- 3. Helper: o usuário vê todos os dados da empresa? ----------
create or replace function private.sees_all(loc uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.location_members
    where location_id = loc
      and user_id = (select auth.uid())
      and only_assigned = false
  )
$$;

revoke all on function private.sees_all(uuid) from public, anon;
grant execute on function private.sees_all(uuid) to authenticated;

-- ---------- 4. "Ver apenas dados atribuídos" nas políticas ----------
-- Só restringe quem tiver only_assigned = true (ninguém, por padrão).
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'opportunities']
  loop
    execute format('drop policy if exists "membros leem" on public.%I;', t);
    execute format($p$
      create policy "membros leem" on public.%I
        for select to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        );
    $p$, t);

    execute format('drop policy if exists "membros editam" on public.%I;', t);
    execute format($p$
      create policy "membros editam" on public.%I
        for update to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        )
        with check (location_id in (select private.user_locations()));
    $p$, t);

    execute format('drop policy if exists "membros excluem" on public.%I;', t);
    execute format($p$
      create policy "membros excluem" on public.%I
        for delete to authenticated
        using (
          location_id in (select private.user_locations())
          and (private.sees_all(location_id) or owner_id = (select auth.uid()))
        );
    $p$, t);
  end loop;
end;
$$;

-- ---------- 5. Proteção: a empresa nunca fica sem administrador ----------
create or replace function private.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admins int;
begin
  if TG_OP = 'DELETE' then
    if OLD.role <> 'admin' then return OLD; end if;
  else
    if OLD.role <> 'admin' or NEW.role = 'admin' then return NEW; end if;
  end if;

  select count(*) into admins
  from public.location_members
  where location_id = OLD.location_id and role = 'admin';

  if admins <= 1 then
    raise exception 'A empresa precisa de pelo menos um administrador';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists protect_last_admin_update on public.location_members;
create trigger protect_last_admin_update
  before update on public.location_members
  for each row execute function private.protect_last_admin();

drop trigger if exists protect_last_admin_delete on public.location_members;
create trigger protect_last_admin_delete
  before delete on public.location_members
  for each row execute function private.protect_last_admin();

-- ---------- 6. Onboarding: aceitar convite pendente ----------
-- Quem foi convidado entra na empresa que convidou (com o papel definido).
-- Quem não tem convite cria a própria empresa (comportamento original).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  loc uuid;
  pipe uuid;
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );

  select * into invite
  from public.invitations
  where status = 'pending' and lower(email) = lower(new.email)
  order by created_at
  limit 1;

  if found then
    insert into public.location_members (location_id, user_id, role, only_assigned, permissions)
    values (invite.location_id, new.id, invite.role, invite.only_assigned, invite.permissions)
    on conflict (location_id, user_id) do nothing;

    update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

    return new;
  end if;

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
