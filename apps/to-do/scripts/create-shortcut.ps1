$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
$ShortcutPath = Join-Path $TodoRoot '启动 To-Do.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $TodoRoot 'scripts\start.ps1') + '"'
$Shortcut.WorkingDirectory = $TodoRoot
$Shortcut.IconLocation = Join-Path $env:SystemRoot 'System32\shell32.dll'
$Shortcut.Description = 'To-Do 桌面版：在 D 盘保存应用数据'
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Output $ShortcutPath
