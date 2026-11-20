@echo off
rem Undoes "Setup LifeOS.cmd": stops LifeOS and removes its three shortcuts. Your vault is not touched.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\pc-app.ps1" -Stop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[Environment]::GetFolderPath; Remove-Item -ErrorAction SilentlyContinue (Join-Path ($f.Invoke('Desktop')) 'LifeOS.lnk'), (Join-Path ($f.Invoke('Programs')) 'LifeOS.lnk'), (Join-Path ($f.Invoke('Startup')) 'LifeOS server.lnk'); Remove-Item -ErrorAction SilentlyContinue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LifeOS'"
echo LifeOS shortcuts removed and LifeOS stopped.
pause
