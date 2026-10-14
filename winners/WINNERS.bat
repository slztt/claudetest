<# : WINNERS Bot one-file launcher. This first part is a Windows batch file; everything after it is PowerShell.
@echo off
title W.I.N.N.E.R.S.
set "JV_SELF=%~f0"
set "JV_ARGS=%*"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:JV_SELF); Invoke-Expression ('& {' + $s + '}')"
set "JV_RC=%errorlevel%"
if not "%JV_RC%"=="0" (
  echo.
  echo Something went wrong. The details are in launcher.log in the WINNERS Bot folder.
  pause
)
rem an update leaves the new launcher next to this one; swap it in as the very last thing cmd reads from this file
if exist "%~f0.new" ( move /y "%~f0.new" "%~f0" >nul & exit /b %JV_RC% )
exit /b %JV_RC%
#>

# =====================================================================================================
#  W.I.N.N.E.R.S. one-file launcher
#  Double-click it. First run: finds or downloads WINNERS Bot, installs Python if needed, builds the
#  environment, asks for your free Gemini key, prepares PC automation, connects Blender / Roblox Studio
#  MCP servers, creates the Start menu + desktop app, then launches WINNERS Bot.
#  Later runs: quick health check, fix anything missing, launch.
#  Options (add after the file name, or use the Start menu entries):
#    repair   run the full scan and setup again        update   download the newest WINNERS Bot (keeps your data)
#    nolaunch set up only
# =====================================================================================================
$ErrorActionPreference = 'Continue'   # native tools (pip, winget) write warnings to stderr; failures are checked explicitly
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}
$Self = $env:JV_SELF
$Opts = " " + ($env:JV_ARGS + "").ToLower() + " "
$Repo = 'slztt/claudetest'
$Branches = @('claude/fervent-wright-75rk61', 'main', 'master')

function Say([string]$kind, [string]$text) {
  $c = @{ ok = 'Yellow'; warn = 'DarkYellow'; bad = 'Red'; dim = 'DarkGray'; step = 'White' }[$kind]
  $m = @{ ok = '  OK '; warn = '  !! '; bad = '  XX '; dim = '     '; step = ' >>> ' }[$kind]
  Write-Host $m -ForegroundColor $c -NoNewline; Write-Host " $text"
}
function Has([string]$o) { return $Opts.Contains(" $o ") }

Clear-Host
Write-Host ""
Write-Host "      W . I . N . N . E . R . S .   B O T" -ForegroundColor Yellow
Write-Host "      The Winners Club N.I. AI control system  -  launcher" -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------- 1. find WINNERS Bot (or download it)
$Here = Split-Path -Parent $Self
if (Test-Path (Join-Path $Here 'winners.py')) { $App = $Here }
elseif (Test-Path (Join-Path $Here 'winners\winners.py')) { $App = Join-Path $Here 'winners' }
else { $App = Join-Path $env:LOCALAPPDATA 'WinnersBot\app' }
New-Item -ItemType Directory -Force -Path $App | Out-Null
try { Start-Transcript -Path (Join-Path $App 'launcher.log') -Force | Out-Null } catch {}

# close a WINNERS Bot that is already running, so the new one (and any update) actually takes effect
try {
  Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*winners.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Say dim "Closed the WINNERS Bot that was already running" }
} catch {}

# always run the newest version: compare the local VERSION file with the one online
$verFile = Join-Path $App 'VERSION'
$localVer = if (Test-Path $verFile) { (Get-Content $verFile -Raw).Trim() } else { '' }
$remoteVer = ''
if (-not (Has 'offline')) {
  foreach ($b in $Branches) {
    try { $remoteVer = ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "https://raw.githubusercontent.com/$Repo/$b/winners/VERSION" -ErrorAction Stop).Content + '').Trim(); if ($remoteVer) { break } } catch {}
  }
}
if ($remoteVer -and $remoteVer -ne $localVer) { Say step "New version available ($(if ($localVer) { $localVer } else { 'old' }) -> $remoteVer)" }
if (-not (Test-Path (Join-Path $App 'winners.py')) -or (Has 'update') -or ($remoteVer -and $remoteVer -ne $localVer)) {
  Say step "Downloading WINNERS Bot"
  $tmp = Join-Path $env:TEMP ("winnersbot-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $got = $false
  foreach ($b in $Branches) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/refs/heads/$b" -OutFile "$tmp\src.zip" -ErrorAction Stop
      Expand-Archive -Path "$tmp\src.zip" -DestinationPath "$tmp\src" -Force -ErrorAction Stop
      $src = Get-ChildItem -Path "$tmp\src" -Recurse -Filter 'winners.py' | Where-Object { $_.Directory.Name -eq 'winners' } | Select-Object -First 1
      if ($src) {
        # copy the program, never the user's environment or data
        foreach ($item in Get-ChildItem -Path $src.Directory.FullName) {
          if ($item.Name -eq 'venv') { continue }
          if ($item.Name -eq 'WINNERS.bat' -and $Self -eq (Join-Path $App 'WINNERS.bat')) {
            Copy-Item -Path $item.FullName -Destination (Join-Path $App 'WINNERS.bat.new') -Force -ErrorAction Stop   # swapped in when this run ends
            continue
          }
          Copy-Item -Path $item.FullName -Destination $App -Recurse -Force -ErrorAction Stop
        }
        $got = $true; Say ok "WINNERS Bot downloaded ($b)"; break
      }
    } catch { Say dim "Branch $b not available: $($_.Exception.Message)" }
  }
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  if (-not $got -and -not (Test-Path (Join-Path $App 'winners.py'))) {
    Say bad "Could not download WINNERS Bot. Check your internet, or unzip WINNERS-Bot.zip and run WINNERS.bat from inside it."
    exit 1
  }
}
# keep a copy of this launcher in the app folder, so the shortcuts can repair and update it
$Launcher = Join-Path $App 'WINNERS.bat'
if ($Self -ne $Launcher -and -not (Test-Path $Launcher)) { Copy-Item -Path $Self -Destination $Launcher -Force }
Set-Location $App
Say ok "WINNERS Bot folder: $App  (version $(if (Test-Path $verFile) { (Get-Content $verFile -Raw).Trim() } else { '?' }))"

# ---------------------------------------------------------------- 2. Python 3.11-3.13 (64-bit)
function Test-Py([string]$exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $false }
  & $exe -c "import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) and sys.maxsize>2**32 else 1)" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
function Find-Py {
  foreach ($v in @('3.12', '3.11', '3.13')) {
    try { $p = (& py "-$v-64" -c "import sys; print(sys.executable)" 2>$null); if ($LASTEXITCODE -eq 0 -and (Test-Py $p)) { return $p } } catch {}
  }
  foreach ($v in @('312', '311', '313')) {
    foreach ($root in @("$env:LOCALAPPDATA\Programs\Python", "$env:ProgramFiles")) {
      if (-not $root -or $root -eq '\Programs\Python') { continue }
      $p = Join-Path $root "Python$v\python.exe"
      if (Test-Py $p) { return $p }
    }
  }
  return $null
}
$VPy = Join-Path $App 'venv\Scripts\python.exe'
$VPyw = Join-Path $App 'venv\Scripts\pythonw.exe'
if ((Test-Path $VPy) -and -not (Test-Py $VPy)) { Say warn "Rebuilding an environment made with an unsupported Python"; Remove-Item -Recurse -Force (Join-Path $App 'venv') }
if (-not (Test-Path $VPy)) {
  Say step "Setting up Python"
  $base = Find-Py
  if (-not $base) {
    Say dim "Installing Python 3.12 (64-bit) for this user..."
    try { & winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements | Out-Null } catch {}
    $base = Find-Py
  }
  if (-not $base) {
    Say dim "winget unavailable; downloading the installer from python.org..."
    $inst = Join-Path $env:TEMP 'python-3.12.10-amd64.exe'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile $inst
    Start-Process -FilePath $inst -ArgumentList '/quiet InstallAllUsers=0 PrependPath=0 Include_launcher=1 Include_test=0' -Wait
    $base = Find-Py
  }
  if (-not $base) { Say bad "Python could not be installed. Install 'Python 3.12 (64-bit)' from python.org, then run this again."; exit 1 }
  Say ok "Python: $base"
  & $base -m venv (Join-Path $App 'venv')
  if (-not (Test-Path $VPy)) { Say bad "Could not create WINNERS Bot's Python environment."; exit 1 }
}

# ---------------------------------------------------------------- 3. packages (each group once; failures retried next run)
function Pip-Group([string]$req, [string]$flag, [string]$label, [bool]$must) {
  $f = Join-Path $App "venv\$flag"
  if (-not (Test-Path (Join-Path $App $req))) { return }
  $hash = (Get-FileHash -Path (Join-Path $App $req) -Algorithm SHA256).Hash
  if ((Test-Path $f) -and ((Get-Content $f -Raw).Trim() -eq $hash) -and -not (Has 'repair')) { return }
  Say step "Installing $label"
  & $VPy -m pip install --disable-pip-version-check -q --upgrade pip | Out-Null
  & $VPy -m pip install --disable-pip-version-check -r (Join-Path $App $req)
  if ($LASTEXITCODE -eq 0) { Set-Content -Path $f -Value $hash; Say ok "$label installed" }
  elseif ($must) { Say bad "$label failed to install (see the red text above). Check your internet and run this again."; exit 1 }
  else { Say warn "$label did not fully install; WINNERS Bot still works and will retry later." }
}
Pip-Group 'requirements.txt' 'core4.flag' 'the core packages' $true
Pip-Group 'requirements-wake.txt' 'wake3.flag' 'the "Hey Winners" wake word' $false
Pip-Group 'requirements-auto.txt' 'auto1.flag' 'the power packages (automation, voice, speech)' $false

# ---------------------------------------------------------------- 4. scan the PC and set up everything else
$state = Join-Path $env:USERPROFILE '.winnersbot\setup.json'
$needSetup = (Has 'repair') -or -not (Test-Path $state)
if (-not $needSetup) { try { $st = Get-Content $state -Raw | ConvertFrom-Json; $needSetup = (-not $st.complete) -or (-not $st.v) -or ($st.v -lt 5) } catch { $needSetup = $true } }
if ($needSetup) {
  Write-Host ""
  & $VPy (Join-Path $App 'jv_setup.py') setup
} else {
  Say ok "Health check passed (run the 'WINNERS Bot Setup and Repair' shortcut to rescan)"
}

# ---------------------------------------------------------------- 5. make the app: Start menu + desktop shortcuts
function Make-Link([string]$path, [string]$target, [string]$arguments, [string]$desc) {
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $target; $s.Arguments = $arguments; $s.WorkingDirectory = $App
  $s.IconLocation = (Join-Path $App 'winners.ico'); $s.Description = $desc
  $s.Save()
}
try {
  $programs = [Environment]::GetFolderPath('Programs')
  $desktop = [Environment]::GetFolderPath('Desktop')
  $q = '"' + (Join-Path $App 'winners.py') + '"'
  # the WINNERS Bot icon goes through this launcher, so every start checks for updates first
  foreach ($dir in @($programs, $desktop)) { Make-Link (Join-Path $dir 'WINNERS Bot.lnk') $Launcher '' 'W.I.N.N.E.R.S.' }
  Make-Link (Join-Path $programs 'WINNERS Bot Setup and Repair.lnk') $Launcher 'repair' 'Scan this PC and repair or update WINNERS Bot'
  Make-Link (Join-Path $programs 'WINNERS Bot Update.lnk') $Launcher 'update' 'Download the newest WINNERS Bot'
  $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'WINNERS Bot.lnk'
  $asked = Join-Path $App 'venv\startup-asked.flag'
  if (-not (Test-Path $asked)) {
    Set-Content -Path $asked -Value 'ok'
    Write-Host ""
    & choice /C YN /T 20 /D N /M "     Start WINNERS Bot automatically when Windows starts (auto-no in 20s)"
    if ($LASTEXITCODE -eq 1) { Make-Link $startup $VPyw $q 'W.I.N.N.E.R.S.'; Say ok "WINNERS Bot will start with Windows" }
  }
  Say ok "App installed: press the Windows key and type WINNERS Bot (or use the desktop icon). Right-click it to pin it to the taskbar."
} catch { Say warn "Shortcuts could not be created: $($_.Exception.Message)" }

# ---------------------------------------------------------------- 6. launch
if (Has 'nolaunch') { Say ok "Setup complete."; exit 0 }
Say step "Launching W.I.N.N.E.R.S."
Start-Process -FilePath $VPyw -ArgumentList ('"' + (Join-Path $App 'winners.py') + '"') -WorkingDirectory $App
try { Stop-Transcript | Out-Null } catch {}
Start-Sleep -Seconds 2
exit 0
