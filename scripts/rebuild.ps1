# Rebuilds the site from the vault, then serves out/.
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\rebuild.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\rebuild.ps1 -HostAddress 100.x.y.z   # your Tailscale IP
#   powershell -ExecutionPolicy Bypass -File scripts\rebuild.ps1 -NoServe                 # build only (for Task Scheduler)
param(
  [int]$Port = 4173,
  [string]$HostAddress = "127.0.0.1",
  [switch]$NoServe
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Building LifeOS..."
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. The previous out/ folder may be incomplete." -ForegroundColor Yellow
  exit $LASTEXITCODE
}

npm run -s check-privacy
if ($LASTEXITCODE -ne 0) {
  Write-Host "Privacy check failed: private journal text is in out/. Not serving. Fix it before sharing anything." -ForegroundColor Yellow
  exit 1
}

if ($NoServe) {
  Write-Host "Build finished. Not serving (-NoServe)."
  exit 0
}

node scripts/lifeos-server.mjs $Port $HostAddress
