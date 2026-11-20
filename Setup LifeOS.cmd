@echo off
rem One-time setup for LifeOS on this PC. Double-click once.
rem Makes a "LifeOS" icon on the Desktop and in the Start menu, makes LifeOS start by itself when you sign in
rem to Windows (so the phone can sync), starts it now and opens the app. Undo with "Remove LifeOS.cmd".
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\install-pc-app.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\pc-app.ps1"
echo.
echo LifeOS is set up. From now on just click the LifeOS icon (or open http://127.0.0.1:4173 in a browser).
echo If Windows asks about Node.js and the firewall, allow "Private networks" only.
pause
