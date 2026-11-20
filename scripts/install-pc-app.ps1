# Adds LifeOS shortcuts to this PC (run once: npm run pc:install).
#   Desktop and Start menu: "LifeOS" (LifeOS.exe, a real app: Start search shows "Pin to Start" and
#   "Pin to taskbar") opens the app window and starts the server if needed.
#   Startup folder: "LifeOS server" starts the server at sign-in, so the phone can sync whenever the PC is on.
# To undo, delete the three shortcuts named LifeOS / LifeOS server.
param([switch]$NoStartup)

$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo "scripts\pc-app.ps1"
$shell = New-Object -ComObject WScript.Shell
$icon = Join-Path $repo "public\icons\lifeos.ico"  # the LifeOS mark (scripts/make-icons.mjs)

$launcher = & (Join-Path $PSScriptRoot "make-launcher.ps1") | Select-Object -Last 1

function New-Shortcut($path, $arguments, $description, [switch]$App) {
  $s = $shell.CreateShortcut($path)
  if ($App) {
    $s.TargetPath = $launcher
    $s.Arguments = ""
  } else {
    $s.TargetPath = "powershell.exe"
    $s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" $arguments"
  }
  $s.WorkingDirectory = $repo
  $s.WindowStyle = 7
  $s.Description = $description
  if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
  $s.Save()
  Write-Output "Made $path"
}

New-Shortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "LifeOS.lnk") "" "Open LifeOS" -App
New-Shortcut (Join-Path ([Environment]::GetFolderPath("Programs")) "LifeOS.lnk") "" "Open LifeOS" -App
if (-not $NoStartup) {
  New-Shortcut (Join-Path ([Environment]::GetFolderPath("Startup")) "LifeOS server.lnk") "-ServerOnly" "Start the LifeOS server at sign-in"
}
