# Zips the built site (out/) into snapshots/lifeos-YYYY-MM-DD.zip. Never overwrites an existing zip.
# WARNING: the zip contains everything in out/, including certificate images and PDFs. Keep it private.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\snapshot.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path "out\index.html")) {
  Write-Host "No out/ folder. Run 'npm run build' first." -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Force "snapshots" | Out-Null
$date = Get-Date -Format "yyyy-MM-dd"
$zip = "snapshots\lifeos-$date.zip"
if (Test-Path $zip) {
  # A second snapshot on the same day gets the time added instead of replacing the first.
  $zip = "snapshots\lifeos-$date-$(Get-Date -Format 'HHmmss').zip"
}

Compress-Archive -Path "out\*" -DestinationPath $zip
Write-Host "Snapshot saved: $((Resolve-Path $zip).Path)"
