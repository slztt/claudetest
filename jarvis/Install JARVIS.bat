@echo off
cd /d "%~dp0"
echo Installing J.A.R.V.I.S., this takes a few minutes...
call _setup.bat
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make_shortcut.ps1"
echo.
echo Done! Press the Windows key and type  JARVIS  to launch him.
echo You can also right-click it there and choose Pin to taskbar.
pause
