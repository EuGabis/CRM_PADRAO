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
--   1. Calcula UMA VEZ, num array, os ids das etapas na ordem
--      (position, created_at, id) — o `id` entra como desempate final
--      porque `position` NÃO é chave única (a tela grava
--      `position: stages.length` ao criar etapa — apagar e criar de
--      novo repete posição — e as etapas semeadas por
--      prepare_client_company/handle_new_user têm `created_at`
--      idêntico, todas do mesmo insert dentro da mesma transação).
--      As primeiras cinco desse array são as "sobreviventes"
--      (reaproveitadas); o resto é "remover". Esse MESMO array é usado
--      depois no laço — não se refaz a consulta, então não há como a
--      ordem mudar entre a checagem e a exclusão.
--   2. Recusa (raise exception) se alguma etapa do grupo "remover"
--      ainda tiver oportunidade — apagar uma etapa com oportunidade
--      apaga a oportunidade junto (FK on delete cascade em
--      opportunities.stage_id), silenciosamente. O dono precisa mover
--      essas oportunidades e rodar de novo.
--   3. Mostra o mapa de-para completo (etapa antiga -> etapa nova,
--      incluindo criações e remoções) ANTES de aplicar qualquer
--      mudança — o remapeamento é por posição, então
--      oportunidades de uma etapa antiga passam a contar como
--      "Fechado/Ganho" ou "Perdido" sem a etapa em si sumir, e é
--      exatamente esse número que a agência olha para saber quanto
--      vendeu. O dono precisa ver isso antes, não descobrir depois.
--   4. Só então: reaproveita (renomeia/recolore) as etapas
--      sobreviventes, cria as que faltarem e apaga as que sobraram
--      (agora comprovadamente vazias).
--
-- ⚠️ RODA EM SIMULAÇÃO POR PADRÃO (`v_aplicar := false`). Nesse modo o
-- script mostra o mapa de-para com `raise exception` e NÃO altera nada
-- (a exceção também desfaz o bloco inteiro, então é seguro por
-- construção). É `raise exception` de propósito, e não `raise notice`:
-- o SQL Editor do Supabase normalmente NÃO exibe notices, e o mapa —
-- que existe justamente para o dono conferir o remapeamento antes de
-- aplicar — não apareceria na tela. Confira o mapa e só então troque
-- para `v_aplicar := true` e rode de novo.
--
-- Idempotente: pode ser rodado de novo sem efeito adicional depois que
-- o funil já está nas cinco etapas.
-- ============================================================

do $$
declare
  -- Gaabtur. Para outra empresa, troque o id aqui (a "Minha empresa" é
  -- 776ffb6b-44ac-46dc-88a6-7e19c53c964f).
  v_location_id   uuid := '394491f9-288d-44b1-9647-ab836b0d699d';
  -- false = simulação: mostra o de-para (via raise exception, que o SQL
  -- Editor exibe) e não altera nada. Troque para true só depois de
  -- conferir o mapa.
  v_aplicar       boolean := true;
  v_pipeline_id   uuid;
  v_nomes         text[] := array['Novo Lead', 'Proposta Enviada', 'Em Negociação', 'Fechado/Ganho', 'Perdido'];
  v_cores         text[] := array['#3b82f6', '#f97316', '#a855f7', '#22c55e', '#ef4444'];
  v_qtd_alvo      int := 5;
  v_ids_ordenados uuid[];
  v_qtd_existente int;
  v_orfas_resumo  text;
  v_mapa          text;
  v_id            uuid;
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

  -- Um único cálculo dos ids ordenados. Tudo abaixo (checagem, aviso e
  -- aplicação) usa este mesmo array, na mesma ordem — nunca uma nova
  -- consulta a public.stages.
  select coalesce(array_agg(id order by position, created_at, id), array[]::uuid[])
    into v_ids_ordenados
    from public.stages
   where pipeline_id = v_pipeline_id;

  v_qtd_existente := cardinality(v_ids_ordenados);

  -- Trava: das etapas em v_ids_ordenados, só as v_qtd_alvo primeiras
  -- (posição 1..v_qtd_alvo do array) são reaproveitadas — o resto
  -- (posição v_qtd_alvo+1..fim, se houver) seria apagado. Recusa se
  -- qualquer uma dessas tiver oportunidade.
  select string_agg(format('"%s" (%s oportunidade(s))', st.name, cnt.c), ', ' order by st.name)
    into v_orfas_resumo
    from public.stages st
    join (
      select stage_id, count(*) as c
        from public.opportunities
       where stage_id = any (v_ids_ordenados[v_qtd_alvo + 1 : v_qtd_existente])
       group by stage_id
    ) cnt on cnt.stage_id = st.id;

  if v_orfas_resumo is not null then
    raise exception 'Existem oportunidades em etapas que seriam removidas ao ajustar o funil: %. Mova essas oportunidades para outra etapa antes de rodar este script de novo.', v_orfas_resumo;
  end if;

  -- Aviso do que vai acontecer, ANTES de aplicar. O remapeamento é por
  -- posição: uma etapa antiga na posição 4 (ex.: "Fechado/Ganho" novo)
  -- passa a contar como ganha mesmo sem a etapa "sumir" — só o nome e a
  -- cor mudam, as oportunidades continuam nela.
  v_mapa := '';
  for v_rn in 1 .. v_qtd_alvo loop
    v_mapa := v_mapa || format(
      '%s. %s -> "%s"; ',
      v_rn,
      case when v_rn <= v_qtd_existente
             then '"' || (select name from public.stages where id = v_ids_ordenados[v_rn]) || '"'
           else '(nova etapa)'
      end,
      v_nomes[v_rn]
    );
  end loop;
  if v_qtd_existente > v_qtd_alvo then
    v_mapa := v_mapa || 'Removidas (vazias, confirmado acima): ' || (
      select string_agg(format('"%s"', st.name), ', ' order by st.name)
        from public.stages st
       where st.id = any (v_ids_ordenados[v_qtd_alvo + 1 : v_qtd_existente])
    );
  end if;
  -- Em simulação, o mapa sai como exceção (o SQL Editor mostra) e nada é
  -- alterado. Em modo de aplicação, fica o notice de sempre.
  if not v_aplicar then
    raise exception 'SIMULAÇÃO (v_aplicar = false), nada foi alterado. Mapa de-para do funil (pipeline %): % --- Confira o mapa acima e, se estiver certo, troque v_aplicar para true e rode de novo.', v_pipeline_id, v_mapa;
  end if;

  raise notice 'Mapa de-para do funil (pipeline %): %', v_pipeline_id, v_mapa;

  -- Comprovadamente seguro a partir daqui: nenhuma etapa a apagar tem
  -- oportunidade, e o de-para já foi mostrado. Reaproveita (por posição
  -- no MESMO array v_ids_ordenados) renomeando/recolorindo — as
  -- oportunidades continuam apontando para o mesmo id de etapa, então
  -- nada se perde.
  for v_rn in 1 .. v_qtd_existente loop
    v_id := v_ids_ordenados[v_rn];
    if v_rn <= v_qtd_alvo then
      update public.stages
         set name = v_nomes[v_rn],
             color = v_cores[v_rn],
             position = v_rn - 1
       where id = v_id;
    else
      delete from public.stages where id = v_id;
    end if;
  end loop;

  -- Cria as que faltarem, se o funil tinha menos que v_qtd_alvo etapas.
  for v_rn in greatest(v_qtd_existente, 0) + 1 .. v_qtd_alvo loop
    insert into public.stages (location_id, pipeline_id, name, color, position)
    values (v_location_id, v_pipeline_id, v_nomes[v_rn], v_cores[v_rn], v_rn - 1);
  end loop;

  raise notice 'Funil ajustado para o pipeline %.', v_pipeline_id;
end $$;
