@echo off
cd /d "%~dp0"
set PYV=

:: A venv built with an unsupported Python (32-bit, too old or too new) is thrown away.
if exist venv\Scripts\python.exe (
  venv\Scripts\python -c "import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) and sys.maxsize>2**32 else 1)" >nul 2>&1
  if errorlevel 1 (
    echo Removing old environment built with an unsupported Python...
    rmdir /s /q venv
  )
)
if exist venv\Scripts\python.exe goto :packages

:: Pick a 64-bit Python that every dependency supports.
for %%V in (3.12 3.11 3.13) do (
  if not defined PYV (
    py -%%V-64 -c "import sys" >nul 2>&1 && set PYV=%%V
  )
)
if not defined PYV (
  echo No suitable Python found. Installing Python 3.12 ^(64-bit^) with winget...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  py -3.12-64 -c "import sys" >nul 2>&1 && set PYV=3.12
)
if not defined PYV (
  echo.
  echo Could not find 64-bit Python 3.11, 3.12 or 3.13.
  echo Install "Python 3.12 Windows installer ^(64-bit^)" from python.org/downloads, tick "Add Python to PATH",
  echo then close this window and run this file again.
  pause
  exit /b 1
)
echo Setting up J.A.R.V.I.S. with Python %PYV% ...
py -%PYV%-64 -m venv venv
if not exist venv\Scripts\python.exe (
  echo Could not create the environment.
  pause
  exit /b 1
)

:packages
if not exist venv\core4.flag (
  venv\Scripts\python -m pip install -q --upgrade pip
  venv\Scripts\python -m pip install -r requirements.txt && echo ok> venv\core4.flag
)
if not exist venv\core4.flag (
  echo.
  echo Setup failed. Scroll up for the red error text, and make sure you are online.
  pause
  exit /b 1
)
if not exist venv\wake3.flag (
  venv\Scripts\python -m pip install -r requirements-wake.txt && echo ok> venv\wake3.flag
)
if not exist venv\wake3.flag (
  echo.
  echo WARNING: the wake-word packages did not install, so "Hey JARVIS" will not work yet.
  echo You can still click the glowing core or type to talk to him. Run this file again to retry.
  echo.
  timeout /t 6 >nul
)
if not exist venv\auto1.flag (
  echo Installing JARVIS-3 power packages ^(automation, local voice, local speech^)...
  venv\Scripts\python -m pip install -r requirements-auto.txt && echo ok> venv\auto1.flag
)
if not exist venv\auto1.flag (
  echo NOTE: some optional power packages did not install. JARVIS will retry them when they are first needed.
  timeout /t 4 >nul
)
exit /b 0
