-- ============================================================
-- CRM ON — Módulo Contatos completo
-- smart_lists, tasks, contact_fields, bulk_logs
-- Mesmo padrão de segurança da 0001: RLS deny-by-default,
-- políticas TO authenticated com checagem de tenant, sem anon.
-- ============================================================

create table public.smart_lists (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  conditions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  assignee_id uuid references auth.users (id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create table public.contact_fields (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  type text not null default 'text' check (type in ('text', 'dropdown', 'date', 'number')),
  options text[] not null default '{}',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.bulk_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  operation text not null,
  affected int not null default 0,
  status text not null default 'done' check (status in ('done', 'processing')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index smart_lists_location_idx on public.smart_lists (location_id);
create index tasks_location_idx on public.tasks (location_id);
create index tasks_contact_idx on public.tasks (contact_id);
create index contact_fields_location_idx on public.contact_fields (location_id);
create index bulk_logs_location_idx on public.bulk_logs (location_id);

alter table public.smart_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.contact_fields enable row level security;
alter table public.bulk_logs enable row level security;

revoke all on public.smart_lists, public.tasks, public.contact_fields, public.bulk_logs from anon;

do $$
declare
  t text;
begin
  foreach t in array array['smart_lists', 'tasks', 'contact_fields', 'bulk_logs']
  loop
    execute format($p$
      create policy "membros leem" on public.%I
        for select to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros criam" on public.%I
        for insert to authenticated
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros editam" on public.%I
        for update to authenticated
        using (location_id in (select private.user_locations()))
        with check (location_id in (select private.user_locations()));
    $p$, t);
    execute format($p$
      create policy "membros excluem" on public.%I
        for delete to authenticated
        using (location_id in (select private.user_locations()));
    $p$, t);
  end loop;
end;
$$;
