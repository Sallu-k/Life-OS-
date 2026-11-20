# Copies the vault into a new dated folder: <Destination>\lifeos-vault-YYYY-MM-DD
# It only READS the vault. It never deletes or changes anything in the source.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-vault.ps1 -Destination "E:\Backups"
#   (add -VaultPath "D:/Vaults/LifeOS-Vault" to override VAULT_PATH from .env.local)
param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

# Same vault as the website: -VaultPath, else VAULT_PATH in .env.local, else the sample vault.
if (-not $VaultPath -and (Test-Path ".env.local")) {
  $line = Get-Content ".env.local" | Where-Object { $_ -match '^\s*VAULT_PATH\s*=' } | Select-Object -First 1
  if ($line) { $VaultPath = ($line -replace '^\s*VAULT_PATH\s*=\s*', '').Trim().Trim('"', "'") }
}
if (-not $VaultPath) { $VaultPath = "./sample-vault" }

$source = (Resolve-Path $VaultPath).Path.TrimEnd('\')
# Work out the full destination path WITHOUT creating it, so nothing is made inside the vault by mistake.
if ([System.IO.Path]::IsPathRooted($Destination)) { $full = $Destination } else { $full = Join-Path (Get-Location).Path $Destination }
$destRoot = [System.IO.Path]::GetFullPath($full).TrimEnd('\')

if ($destRoot -eq $source -or $destRoot.StartsWith("$source\", [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Host "The destination is inside the vault. Choose a folder outside it." -ForegroundColor Yellow
  exit 1
}
New-Item -ItemType Directory -Force $destRoot | Out-Null

$target = Join-Path $destRoot "lifeos-vault-$(Get-Date -Format 'yyyy-MM-dd')"
if (Test-Path $target) { $target = "$target-$(Get-Date -Format 'HHmmss')" }

# /E copies all subfolders. No /MIR or /MOV, so nothing is ever removed, from the source or anywhere else.
robocopy $source $target /E /COPY:DAT /DCOPY:T /R:1 /W:1 /XJ /NFL /NDL /NP
# Robocopy exit codes below 8 mean success.
if ($LASTEXITCODE -ge 8) {
  Write-Host "Backup failed (robocopy code $LASTEXITCODE)." -ForegroundColor Yellow
  exit $LASTEXITCODE
}
Write-Host "Backup saved: $target"
exit 0
