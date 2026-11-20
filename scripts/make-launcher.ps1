# Builds LifeOS.exe: a tiny Windows program with the LifeOS icon that starts LifeOS (scripts/pc-app.ps1)
# without any window. Windows treats it as a real app: it shows in Start search with "Pin to Start" and
# "Pin to taskbar". Made with the C# compiler that comes with Windows (.NET Framework), no packages.
# Output: %LOCALAPPDATA%\LifeOS\LifeOS.exe (rebuilt each time setup runs; not part of the repo).
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo "scripts\pc-app.ps1"
$icon = Join-Path $repo "public\icons\lifeos.ico"
$outDir = Join-Path $env:LOCALAPPDATA "LifeOS"
$exe = Join-Path $outDir "LifeOS.exe"
New-Item -ItemType Directory -Force $outDir | Out-Null

$code = @"
using System.Diagnostics;
[assembly: System.Reflection.AssemblyTitle("LifeOS")]
[assembly: System.Reflection.AssemblyProduct("LifeOS")]
public static class LifeOSLauncher {
  public static void Main() {
    var start = new ProcessStartInfo("powershell.exe",
      "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"$($script.Replace('\', '\\'))\"");
    start.UseShellExecute = false;
    start.CreateNoWindow = true;
    start.WindowStyle = ProcessWindowStyle.Hidden;
    Process.Start(start);
  }
}
"@

$csc = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) "csc.exe"
$src = Join-Path $outDir "LifeOSLauncher.cs"
Set-Content -Path $src -Value $code -Encoding UTF8
if (Test-Path $exe) { Remove-Item $exe -Force }
& $csc /nologo /target:winexe "/win32icon:$icon" "/out:$exe" $src | Out-Host
if (-not (Test-Path $exe)) { throw "Could not build LifeOS.exe" }
Remove-Item $src
Write-Output $exe
