# Gera supabase/setup/*.sql a partir de supabase/migrations/.
#
# Existe porque os numeros das migracoes NAO servem como ordem: 0014, 0015,
# 0016 e 0019 aparecem duas vezes cada, e o 0008 foi escrito depois do
# 0009-0011. A ordem abaixo veio da data do commit que criou cada arquivo.
#
# Uso:  pwsh scripts/gerar-setup.ps1      (ou powershell)
#
# Ao criar uma migracao nova, adicione o nome dela na parte correspondente
# (ou em $excluidas). O script FALHA se alguma migracao ficar sem classificar,
# de proposito -- migracao esquecida aqui vira banco novo instalado incompleto.

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $raiz "supabase\migrations"
$out  = Join-Path $raiz "supabase\setup"

$partes = [ordered]@{
  "01_fundacao" = @(
    "0001_initial_schema.sql","0002_contacts_module.sql","0003_conversas_realtime.sql",
    "0004_equipe_permissoes.sql","0005_activation_checklist.sql","0006_cadastro_por_convite.sql",
    "0007_automations.sql"
  )
  "02_marketing_pagamentos" = @(
    "0010_email_marketing.sql","0008_pagamentos_guru.sql","0012_pagamentos_guru_assinaturas.sql",
    "0013_pagamentos_guru_sync.sql","0015_payment_files.sql","0016_payment_contacts_view.sql",
    "0014_marketing_extras.sql","0015_campaign_accent.sql","0016_campaign_claim.sql",
    "0017_guru_history_backfill.sql","0018_guru_contacts_sync.sql",
    "0019_payment_contacts_valores.sql","0020_payment_sales_reports.sql",
    "0021_payment_contacts_perf.sql"
  )
  "03_conversas_whatsapp_ia" = @(
    "0019_conversation_media.sql","0022_whatsapp.sql","0023_google_ads.sql","0024_forms.sql",
    "0025_conversas_atribuicao.sql","0026_ai_logs.sql","0027_conversas_rail.sql",
    "0028_mensagens_agendadas.sql","0029_conversas_finalizar_arquivar.sql","0030_ai_agents.sql",
    "0031_whatsapp_template_tracking.sql","0032_whatsapp_autoreply.sql"
  )
  "04_departamentos_painel_agenda" = @(
    "0033_departamentos.sql","0034_company_logo.sql","0035_departamento_canais.sql",
    "0036_pagamentos_status_membros.sql","0037_dashboard_views.sql","0038_message_type_video.sql",
    "0039_pipelines_segmentacao.sql","0040_conversas_excluir_admin.sql",
    "0041_compromissos_lead.sql","0042_compromissos_lembrete.sql",
    "0043_compromissos_por_usuario.sql",
    # 0044 por ULTIMO de proposito: concede privilegio em "all tables in
    # schema public", entao precisa rodar depois que todas ja existem.
    "0044_grants_service_role.sql",
    "0045_remove_marca_antiga.sql",
    "0046_location_limits.sql",
    "0047_limite_usuarios.sql",
    "0048_limite_canais.sql",
    "0049_campanha_motivo_pausa.sql",
    "0050_plataforma.sql",
    "0051_suspensao.sql"
  )
}

# Agendam pg_cron chamando uma URL publica que ainda nao existe (o
# placeholder https://SEU-DOMINIO). Ver "O que ficou de fora" no README.
$excluidas = @("0009_automation_cron.sql","0011_marketing_cron.sql","0014_guru_sync_config.sql")

$todas = @()
foreach ($p in $partes.Values) { $todas += $p }

$noDisco = Get-ChildItem $src -Name -Filter "*.sql"
$naoClassificadas = $noDisco | Where-Object { $_ -notin $todas -and $_ -notin $excluidas }
if ($naoClassificadas) {
  throw "Migracao sem classificacao neste script: $($naoClassificadas -join ', ')"
}
$inexistentes = $todas | Where-Object { $_ -notin $noDisco }
if ($inexistentes) {
  throw "Listada aqui mas ausente de migrations/: $($inexistentes -join ', ')"
}

if (Test-Path $out) { Get-ChildItem $out -Filter "*.sql" | Remove-Item -Force }
New-Item -ItemType Directory -Force $out | Out-Null

foreach ($nome in $partes.Keys) {
  $destino = Join-Path $out "$nome.sql"
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("-- ============================================================")
  [void]$sb.AppendLine("-- SETUP $nome")
  [void]$sb.AppendLine("-- GERADO por scripts/gerar-setup.ps1 -- nao edite a mao.")
  [void]$sb.AppendLine("-- Fonte: supabase/migrations/, em ordem cronologica real.")
  [void]$sb.AppendLine("-- Rode as partes 01 -> 04 EM ORDEM no SQL Editor. Ver README.md.")
  [void]$sb.AppendLine("-- ============================================================")
  [void]$sb.AppendLine("")

  foreach ($arq in $partes[$nome]) {
    # -Encoding UTF8 e OBRIGATORIO: o Get-Content do PowerShell 5.1 assume a
    # codepage ANSI do sistema e transforma cada acento em mojibake. Isso ja
    # corrompeu a descricao de departamento da 0033 dentro do banco.
    $linhas = Get-Content (Join-Path $src $arq) -Encoding UTF8

    # O 0013 termina com um cron.schedule apontando pra producao antiga.
    # As colunas dele importam; o agendamento nao.
    if ($arq -eq "0013_pagamentos_guru_sync.sql") {
      $corte = ($linhas | Select-String -Pattern "^-- Agendamento" | Select-Object -First 1).LineNumber
      if (-not $corte) { throw "0013: marcador '-- Agendamento' sumiu; revise o corte do cron" }
      $linhas = $linhas[0..($corte - 3)]
    }

    [void]$sb.AppendLine("-- ------------------------------------------------------------")
    [void]$sb.AppendLine("-- $arq")
    [void]$sb.AppendLine("-- ------------------------------------------------------------")
    [void]$sb.AppendLine(($linhas -join "`n"))
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("")
  }

  [System.IO.File]::WriteAllText($destino, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
  $kb = "{0:N0}" -f ((Get-Item $destino).Length / 1KB)
  Write-Output ("{0,-34} {1,5} KB  ({2} migracoes)" -f "$nome.sql", $kb, $partes[$nome].Count)
}

Write-Output ""
Write-Output "Excluidas (cron da producao antiga): $($excluidas -join ', ')"
