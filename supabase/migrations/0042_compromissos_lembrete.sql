-- ============================================================
-- CRM ON — Calendários: lembrete do compromisso dentro do CRM
--
-- Quantos minutos antes do início o CRM deve avisar quem estiver com a
-- plataforma aberta. `null` = sem lembrete (é o default, então nenhum
-- compromisso existente passa a avisar do nada).
--
-- Guardado no compromisso, e não numa preferência do usuário: o aviso é da
-- REUNIÃO. "Avisar 1 dia antes" faz sentido para uma visita e é ruído para um
-- retorno de 10 minutos — quem marca decide, e vale para todo mundo que
-- enxerga aquele compromisso.
--
-- Só o "já avisei" fica FORA do banco (localStorage do navegador): é estado de
-- tela, por dispositivo. Marcar no banco esconderia o aviso no computador
-- porque o celular mostrou primeiro.
--
-- Sem policy nova: `appointments` já tem RLS de membership desde a 0001 e a
-- coluna entra na mesma linha.
--
-- Idempotente.
-- ============================================================

alter table public.appointments
  add column if not exists reminder_minutes int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_reminder_minutes_check'
  ) then
    -- Teto de 7 dias: acima disso o aviso deixa de ser lembrete e vira
    -- ruído de semanas antes.
    alter table public.appointments
      add constraint appointments_reminder_minutes_check
      check (reminder_minutes is null or (reminder_minutes >= 0 and reminder_minutes <= 10080));
  end if;
end;
$$;
