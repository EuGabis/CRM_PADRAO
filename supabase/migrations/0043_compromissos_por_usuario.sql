-- ============================================================
-- CRM ON — Calendários: agenda por usuário
--
-- Até aqui a agenda era uma só: todo membro via (e apagava) o compromisso de
-- qualquer um. Agora cada compromisso tem dono e cada pessoa vê a própria
-- agenda; administrador vê tudo.
--
-- `owner_id` NULO = compromisso da empresa, visível para todos. É o que os
-- compromissos JÁ EXISTENTES viram: não há como adivinhar quem os criou, e
-- fazê-los sumir da agenda de todo mundo seria pior do que mantê-los
-- compartilhados. Os novos nascem com dono (o criador, ou quem o admin
-- escolher).
--
-- Isso é RLS, não filtro de tela: sem as policies abaixo, a agenda alheia
-- continuaria a um GET de distância.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists appointments_owner_idx
  on public.appointments (location_id, owner_id);

-- ---------- Policies (recriam as do laço da 0001) ----------

drop policy if exists "membros leem" on public.appointments;
drop policy if exists "agenda: leitura" on public.appointments;
create policy "agenda: leitura" on public.appointments
  for select to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

-- Criar para si mesmo, ou sem dono (compromisso da empresa). Só admin cria na
-- agenda de outra pessoa — senão qualquer um lotaria o calendário do colega.
drop policy if exists "membros criam" on public.appointments;
drop policy if exists "agenda: criacao" on public.appointments;
create policy "agenda: criacao" on public.appointments
  for insert to authenticated
  with check (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

drop policy if exists "membros editam" on public.appointments;
drop policy if exists "agenda: edicao" on public.appointments;
create policy "agenda: edicao" on public.appointments
  for update to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  )
  with check (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );

drop policy if exists "membros excluem" on public.appointments;
drop policy if exists "agenda: exclusao" on public.appointments;
create policy "agenda: exclusao" on public.appointments
  for delete to authenticated
  using (
    location_id in (select private.user_locations())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or private.is_admin(location_id)
    )
  );
