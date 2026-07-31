# ─────────────────────────────────────────────────────────────────
# build-discloud.ps1 — Prepara o ZIP para upload no Discloud
# Execute: .\build-discloud.ps1
#
# ATENÇÃO: o Vite já grava direto em backend/public (outDir no
# frontend/vite.config.js, com emptyOutDir). NÃO copiar frontend/dist
# por cima: aquela pasta é lixo antigo de quando o outDir era outro, e
# copiá-la APAGA o build de verdade.
# ─────────────────────────────────────────────────────────────────

$root     = $PSScriptRoot
$frontend = Join-Path $root "frontend"
$backend  = Join-Path $root "backend"
$public   = Join-Path $backend "public"
$tmp      = Join-Path $root "__deploy_tmp"
$zipPath  = Join-Path $root "ERPLyon-discloud.zip"

Write-Host "=== Build ERP Lyon para Discloud ===" -ForegroundColor Cyan

# 1. Build do frontend (sai direto em backend/public)
Write-Host "`n[1/3] Buildando frontend React..." -ForegroundColor Yellow
Set-Location $frontend
& npm run build
if ($LASTEXITCODE -ne 0) { Set-Location $root; Write-Host "ERRO no build do frontend!" -ForegroundColor Red; exit 1 }
Set-Location $root

# 2. Confere se o build chegou mesmo em backend/public
Write-Host "`n[2/3] Conferindo o build..." -ForegroundColor Yellow
$assets = @(Get-ChildItem (Join-Path $public "assets") -File -ErrorAction SilentlyContinue)
if (-not (Test-Path (Join-Path $public "index.html")) -or $assets.Count -lt 50) {
  Write-Host "ERRO: backend/public parece incompleto ($($assets.Count) assets)." -ForegroundColor Red
  Write-Host "Rode 'git checkout -- backend/public' e tente de novo." -ForegroundColor Red
  exit 1
}
Write-Host "  OK: index.html + $($assets.Count) assets"

# 3. Gera o ZIP do backend (sem node_modules, .env e logs)
#
# Montado entrada por entrada de proposito. No Windows PowerShell 5.1,
# tanto o Compress-Archive quanto o ZipFile.CreateFromDirectory gravam os
# caminhos com "\", e o Discloud (Linux) nao entende isso: descompacta
# tudo achatado na raiz e o app nao sobe. Aqui o caminho de cada entrada
# e normalizado para "/" na mao.
Write-Host "`n[3/3] Gerando ZIP para upload..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
$n = 0
try {
  Get-ChildItem $backend -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($backend.Length + 1).Replace('\', '/')
    if ($rel -like 'node_modules/*' -or $rel -like '.env*' -or $rel -like '*.log') { return }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
    $n++
  }
} finally {
  $zip.Dispose()
}
Write-Host "  OK: $n arquivos no ZIP"

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "`n=== PRONTO! ===" -ForegroundColor Green
Write-Host "ZIP gerado: $zipPath ($mb MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. Acesse https://discloud.app" -ForegroundColor White
Write-Host "  2. App lyoncopos.online -> Commit/Atualizar app" -ForegroundColor White
Write-Host "  3. Faca upload do arquivo: ERPLyon-discloud.zip" -ForegroundColor White
Write-Host ""
Write-Host "As variaveis de ambiente ficam no painel do Discloud (nao vao no ZIP)." -ForegroundColor Gray
