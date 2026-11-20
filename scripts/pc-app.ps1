# LifeOS on the PC. Nothing here needs a terminal: the shortcuts made by "Setup LifeOS.cmd" run it hidden.
#   pc-app.ps1              make sure LifeOS is running, then open the app window (Edge app mode)
#   pc-app.ps1 -ServerOnly  make sure LifeOS is running (used at Windows sign-in, so the phone can sync)
#   pc-app.ps1 -Keeper      the background keeper: runs the server and the Gate, and starts them again if they stop
#   pc-app.ps1 -Stop        stop LifeOS (keeper and server)
param([switch]$ServerOnly, [switch]$Keeper, [switch]$Stop)

$repo = Split-Path -Parent $PSScriptRoot
$port = 4173
$url = "http://127.0.0.1:$port"
$logDir = Join-Path $env:LOCALAPPDATA "LifeOS"
$keeperPid = Join-Path $logDir "keeper.pid"
New-Item -ItemType Directory -Force $logDir | Out-Null

function Test-Server {
  try { (Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}
function Stop-Port {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue }
}
function Test-Keeper {
  if (-not (Test-Path $keeperPid)) { return $false }
  $id = [int](Get-Content $keeperPid -ErrorAction SilentlyContinue)
  return [bool](Get-Process -Id $id -ErrorAction SilentlyContinue)
}

if ($Stop) {
  if (Test-Keeper) { Stop-Process -Id ([int](Get-Content $keeperPid)) -Force -Confirm:$false -ErrorAction SilentlyContinue }
  Remove-Item $keeperPid -ErrorAction SilentlyContinue
  Stop-Port
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*pc-gate.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
  exit 0
}

if ($Keeper) {
  # Runs until stopped: keeps the server running (started again 5 seconds after it exits) and the Gate
  # (pc-gate.ps1, the "why now?" screen after sign-in and every unlock). The first Gate shows at once.
  $PID | Set-Content $keeperPid
  $node = (Get-Command node -ErrorAction Stop).Source
  $server = $null
  $gate = $null
  $gateArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\pc-gate.ps1`" -AtStart"
  while ($true) {
    if (-not (Test-Server) -and (-not $server -or $server.HasExited)) {
      "$(Get-Date -Format s) starting LifeOS" | Add-Content (Join-Path $logDir "keeper.log")
      $server = Start-Process -FilePath $node -ArgumentList "scripts/lifeos-server.mjs" -WorkingDirectory $repo -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "server.log") -RedirectStandardError (Join-Path $logDir "server-errors.log")
    }
    if (-not $gate -or $gate.HasExited) {
      $gate = Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $gateArgs -PassThru
      $gateArgs = $gateArgs -replace " -AtStart$", ""  # a restarted Gate waits for the next unlock
    }
    Start-Sleep -Seconds 5
  }
}

# Start the keeper (hidden, independent of whatever started this) unless one is already running.
if (-not (Test-Keeper)) {
  if (Test-Server) { Stop-Port; Start-Sleep -Milliseconds 500 }  # a server started by hand: hand it over to the keeper
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Keeper"
}
for ($i = 0; $i -lt 60 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 500 }
if ($ServerOnly) { exit 0 }

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Start-Process $edge "--app=$url/today/" } else { Start-Process "$url/today/" }
