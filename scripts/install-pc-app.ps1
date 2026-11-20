# Adds LifeOS shortcuts to this PC (run once: npm run pc:install).
#   Desktop and Start menu: "LifeOS" (LifeOS.exe, a real app: Start search shows "Pin to Start" and
#   "Pin to taskbar") opens the app window and starts the server if needed.
#   Startup folder: "LifeOS server" starts the server at sign-in, so the phone can sync whenever the PC is on.
# To undo, delete the three shortcuts named LifeOS / LifeOS server.
param([switch]$NoStartup)

$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo "scripts\pc-app.ps1"
$shell = New-Object -ComObject WScript.Shell
$icon = Join-Path $repo "public\icons\lifeos.ico"  # the LifeOS icon (scripts/make-icons.ps1)

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
# Listed in Windows Settings > Apps > Installed apps as "LifeOS" (publisher: $env:LIFEOS_SIGN_NAME, default "LifeOS"). Uninstall there runs
# "Remove LifeOS.cmd" (stops LifeOS, removes the shortcuts and this entry; the vault is never touched).
$key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LifeOS"
New-Item -Path $key -Force | Out-Null
$entry = @{ DisplayName = "LifeOS"; Publisher = $(if ($env:LIFEOS_SIGN_NAME) { $env:LIFEOS_SIGN_NAME } else { "LifeOS" }); DisplayIcon = $icon; InstallLocation = $repo; DisplayVersion = "1.0"
  UninstallString = "cmd.exe /c `"$(Join-Path $repo 'Remove LifeOS.cmd')`"" }
foreach ($name in $entry.Keys) { Set-ItemProperty -Path $key -Name $name -Value $entry[$name] }
Set-ItemProperty -Path $key -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $key -Name NoRepair -Value 1 -Type DWord

if (-not $NoStartup) {
  New-Shortcut (Join-Path ([Environment]::GetFolderPath("Startup")) "LifeOS server.lnk") "-ServerOnly" "Start the LifeOS server at sign-in"
}
