---
title: PowerShell recipes for PC administration
domain: windows
kind: knowledge
tags: windows powershell process service file folder winget install startup scheduled task zip registry
created: seed
---
- Known folders: `[Environment]::GetFolderPath('Desktop')` (also 'MyDocuments', 'ApplicationData'). Downloads: `Join-Path $env:USERPROFILE 'Downloads'`.
- Processes: `Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,CPU,Id`; end one: `Stop-Process -Name notepad -Force`.
- Services: `Get-Service -Name Spooler`, `Restart-Service Spooler` (needs admin).
- Install apps: `winget install --id <Publisher.App> -e --accept-source-agreements --accept-package-agreements`; find the id first with `winget search <name>`.
- Zip: `Compress-Archive -Path <src> -DestinationPath <zip> -Force`; `Expand-Archive -Path <zip> -DestinationPath <dir> -Force`.
- Hardware info: `Get-CimInstance Win32_ComputerSystem`, `Win32_OperatingSystem`, `Win32_LogicalDisk`.
- Scheduled task: `Register-ScheduledTask -TaskName X -Action (New-ScheduledTaskAction -Execute 'python' -Argument 'C:\x.py') -Trigger (New-ScheduledTaskTrigger -Daily -At 9am)`.
- Environment variable (user): `[Environment]::SetEnvironmentVariable('NAME','value','User')`; running programs only see it after restart.
- Check a path: `Test-Path`. Deleting: `Remove-Item -Recurse` is permanent; prefer file_ops delete (goes to a recoverable trash).
- Admin rights: pass `admin: true` to run_script; the user gets an approval card and a Windows UAC prompt.
- Quote paths with spaces. `&&` does not exist in Windows PowerShell 5.1; use `;` or separate lines.
