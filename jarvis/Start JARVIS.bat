@echo off
cd /d "%~dp0"
call _setup.bat
if errorlevel 1 exit /b 1
start "" venv\Scripts\pythonw.exe jarvis.py
