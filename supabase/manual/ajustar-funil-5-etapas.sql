-- ============================================================
-- Ajusta o funil de UMA empresa já existente para as cinco etapas
-- padrão introduzidas na migração 0061 (Novo Lead, Proposta Enviada,
-- Em Negociação, Fechado/Ganho, Perdido).
--
-- Roda à mão no SQL Editor, uma empresa por vez — NÃO é migração e NÃO
-- entra em scripts/gerar-setup.ps1. A 0061 só mexe no seed de empresa
-- nova de propósito: empresa existente pode ter oportunidades nas
-- etapas antigas, e reescrever o funil em massa apagaria trabalho de
-- vendas em silêncio.
--
-- TROQUE v_location_id abaixo pelo id da empresa antes de rodar.
--
-- Ordem de segurança:
--   1. Recusa (raise exception) se alguma etapa que seria removida
--      ainda tiver oportunidade — apagar uma etapa com oportunidade
--      apaga a oportunidade junto (FK on delete cascade em
--      opportunities.stage_id), silenciosamente. O dono precisa mover
--      essas oportunidades e rodar de novo.
--   2. Só então: reaproveita (renomeia/recolore) as primeiras cinco
--      etapas por posição, cria as que faltarem e apaga as que
--      sobrarem (agora comprovadamente vazias).
--
-- Idempotente: pode ser rodado de novo sem efeito adicional depois que
-- o funil já está nas cinco etapas.
-- ============================================================

do $$
declare
  v_location_id   uuid := '00000000-0000-0000-0000-000000000000'; -- <<< TROQUE AQUI antes de rodar
  v_pipeline_id   uuid;
  v_nomes         text[] := array['Novo Lead', 'Proposta Enviada', 'Em Negociação', 'Fechado/Ganho', 'Perdido'];
  v_cores         text[] := array['#3b82f6', '#f97316', '#a855f7', '#22c55e', '#ef4444'];
  v_qtd_alvo      int := 5;
  v_qtd_existente int;
  v_orfas_resumo  text;
  r               record;
  v_rn            int;
begin
  select id into v_pipeline_id
    from public.pipelines
   where location_id = v_location_id
     and name = '✅ Controle de Leads'
   limit 1;

  if v_pipeline_id is null then
    raise exception 'Nenhum pipeline "✅ Controle de Leads" encontrado para o location_id %. Confira o id antes de rodar.', v_location_id;
  end if;

  select count(*) into v_qtd_existente
    from public.stages
   where pipeline_id = v_pipeline_id;

  -- Trava: das etapas atuais, ordenadas por posição, só as v_qtd_alvo
  -- primeiras são reaproveitadas — o resto seria apagado. Recusa se
  -- qualquer uma das que sairiam tiver oportunidade.
  select string_agg(format('"%s" (%s oportunidade(s))', s.name, s.cnt), ', ' order by s.name)
    into v_orfas_resumo
    from (
      select st.id, st.name, count(o.id) as cnt,
             row_number() over (order by st.position, st.created_at) as rn
        from public.stages st
        left join public.opportunities o on o.stage_id = st.id
       where st.pipeline_id = v_pipeline_id
       group by st.id, st.name, st.position, st.created_at
    ) s
   where s.rn > v_qtd_alvo
     and s.cnt > 0;

  if v_orfas_resumo is not null then
    raise exception 'Existem oportunidades em etapas que seriam removidas ao ajustar o funil: %. Mova essas oportunidades para outra etapa antes de rodar este script de novo.', v_orfas_resumo;
  end if;

  -- Comprovadamente seguro a partir daqui: nenhuma etapa a apagar tem
  -- oportunidade. Reaproveita as primeiras v_qtd_alvo etapas (por
  -- posição) renomeando/recolorindo — as oportunidades continuam
  -- apontando para o mesmo id de etapa, então nada se perde.
  v_rn := 0;
  for r in
    select id
      from public.stages
     where pipeline_id = v_pipeline_id
     order by position, created_at
  loop
    v_rn := v_rn + 1;
    if v_rn <= v_qtd_alvo then
      update public.stages
         set name = v_nomes[v_rn],
             color = v_cores[v_rn],
             position = v_rn - 1
       where id = r.id;
    else
      delete from public.stages where id = r.id;
    end if;
  end loop;

  -- Cria as que faltarem, se o funil tinha menos que v_qtd_alvo etapas.
  for v_rn in greatest(v_qtd_existente, 0) + 1 .. v_qtd_alvo loop
    insert into public.stages (location_id, pipeline_id, name, color, position)
    values (v_location_id, v_pipeline_id, v_nomes[v_rn], v_cores[v_rn], v_rn - 1);
  end loop;

  raise notice 'Funil ajustado para o pipeline %.', v_pipeline_id;
end $$;
