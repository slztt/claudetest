$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ws = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
foreach ($p in $places) {
  $s = $ws.CreateShortcut((Join-Path $p "JARVIS.lnk"))
  $s.TargetPath = Join-Path $root "venv\Scripts\pythonw.exe"
  $s.Arguments = '"' + (Join-Path $root "jarvis.py") + '"'
  $s.WorkingDirectory = $root
  $s.IconLocation = (Join-Path $root "jarvis.ico")
  $s.Description = "J.A.R.V.I.S."
  $s.Save()
}
