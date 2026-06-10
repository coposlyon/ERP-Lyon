# ─────────────────────────────────────────────────────────────────
# build-discloud.ps1 — Prepara o ZIP para upload no Discloud
# Execute: .\build-discloud.ps1
# ─────────────────────────────────────────────────────────────────

$root     = $PSScriptRoot
$frontend = Join-Path $root "frontend"
$backend  = Join-Path $root "backend"
$public   = Join-Path $backend "public"
$zipPath  = Join-Path $root "ERPLyon-discloud.zip"

Write-Host "=== Build ERP Lyon para Discloud ===" -ForegroundColor Cyan

# 1. Build do frontend
Write-Host "`n[1/3] Buildando frontend React..." -ForegroundColor Yellow
Set-Location $frontend
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no build do frontend!" -ForegroundColor Red; exit 1 }

# 2. Copia dist para backend/public
Write-Host "`n[2/3] Copiando build para backend/public..." -ForegroundColor Yellow
if (Test-Path $public) { Remove-Item $public -Recurse -Force }
Copy-Item (Join-Path $frontend "dist") $public -Recurse
Write-Host "  OK: $(Get-ChildItem $public -Recurse | Measure-Object).Count arquivos copiados"

# 3. Gera o ZIP do backend (sem node_modules)
Write-Host "`n[3/3] Gerando ZIP para upload..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Set-Location $backend
$exclude = @("node_modules", ".env", "*.log")

Get-ChildItem $backend -Recurse |
  Where-Object {
    $rel = $_.FullName.Substring($backend.Length + 1)
    -not ($rel -match '^node_modules' -or $rel -match '^\.env' -or $rel -match '\.log$')
  } |
  Compress-Archive -DestinationPath $zipPath -Update

Write-Host "`n=== PRONTO! ===" -ForegroundColor Green
Write-Host "ZIP gerado: $zipPath" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. Acesse https://discloud.app" -ForegroundColor White
Write-Host "  2. Clique em 'Adicionar App'" -ForegroundColor White
Write-Host "  3. Faça upload do arquivo: ERPLyon-discloud.zip" -ForegroundColor White
Write-Host "  4. Configure as variaveis de ambiente no painel:" -ForegroundColor White
Write-Host "     SUPABASE_URL=https://abtbkajjtuetactzsaou.supabase.co" -ForegroundColor Gray
Write-Host "     SUPABASE_SERVICE_KEY=..." -ForegroundColor Gray
Write-Host "     SUPABASE_ANON_KEY=..." -ForegroundColor Gray
Write-Host "     FRONTEND_URL=https://lyoncopos.discloud.app" -ForegroundColor Gray
Write-Host "     NODE_ENV=production" -ForegroundColor Gray

Set-Location $root
