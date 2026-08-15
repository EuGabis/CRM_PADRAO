-- ============================================================
-- CRM ON — Checklist de ativação persistente (por empresa)
-- Guarda quem concluiu cada passo e quando.
-- ============================================================

create table if not exists public.activation_steps (
  location_id uuid not null references public.locations (id) on delete cascade,
  step_key text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references auth.users (id) on delete set null,
  primary key (location_id, step_key)
);

alter table public.activation_steps enable row level security;
revoke all on public.activation_steps from anon;

drop policy if exists "membros leem" on public.activation_steps;
create policy "membros leem" on public.activation_steps
  for select to authenticated
  using (location_id in (select private.user_locations()));

drop policy if exists "membros criam" on public.activation_steps;
create policy "membros criam" on public.activation_steps
  for insert to authenticated
  with check (location_id in (select private.user_locations()));

drop policy if exists "membros excluem" on public.activation_steps;
create policy "membros excluem" on public.activation_steps
  for delete to authenticated
  using (location_id in (select private.user_locations()));
