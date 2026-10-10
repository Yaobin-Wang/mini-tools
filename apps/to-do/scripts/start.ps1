param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
try {
    $Node = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $TodoRoot 'dist\index.html'))) { throw '构建产物不存在，请先运行 scripts\build.ps1。' }
    $ExpectedRoot = [IO.Path]::GetFullPath($TodoRoot).TrimEnd('\')
    $Health = $null
    try { $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/healthz' -TimeoutSec 2 } catch {}
    if ($Health) {
        if ($Health.app -ne 'todo-desktop-v2' -or [IO.Path]::GetFullPath($Health.root).TrimEnd('\') -ne $ExpectedRoot) { throw '4173 端口已被其他应用占用，未启动或终止任何其他服务。' }
        if ($Health.restApi -ne 4) {
            $OldService = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$Health.pid)
            $ServerPath = Join-Path $TodoRoot 'scripts\server.mjs'
            $Listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction Stop
            if (-not $OldService -or $OldService.ExecutablePath -ne $Node -or -not $OldService.CommandLine.Contains('"' + $ServerPath + '"') -or $Listener.OwningProcess -notcontains [int]$Health.pid) { throw '旧服务身份无法核实，未停止任何进程。' }
            Stop-Process -Id ([int]$Health.pid) -ErrorAction Stop
            Wait-Process -Id ([int]$Health.pid) -Timeout 5 -ErrorAction SilentlyContinue
            $Health = $null
        }
    }
    if (-not $Health) {
        $Taken = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
        if ($Taken) { throw '4173 端口已被其他应用占用。请关闭占用者后重试；应用不会自动更换端口。' }
        $Service = Start-Process -FilePath $Node -ArgumentList ('"' + (Join-Path $TodoRoot 'scripts\server.mjs') + '"') -WorkingDirectory $TodoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $TodoRoot '.runtime\logs\server.log') -RedirectStandardError (Join-Path $TodoRoot '.runtime\logs\server-error.log')
        for ($Attempt=0; $Attempt -lt 30; $Attempt++) {
            Start-Sleep -Milliseconds 200
            try { $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/healthz' -TimeoutSec 1; break } catch {}
            if ($Service.HasExited) { throw '本地服务未能启动，请查看 .runtime\logs\server-error.log。' }
        }
        if (-not $Health -or $Health.app -ne 'todo-desktop-v2' -or [IO.Path]::GetFullPath($Health.root).TrimEnd('\') -ne $ExpectedRoot) { throw '本地服务启动失败，或端口被其他进程抢占。' }
    }
    $Browser = $null
    foreach ($Key in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe')) {
        if (Test-Path -LiteralPath $Key) { $Candidate = (Get-Item -LiteralPath $Key).GetValue(''); if ($Candidate -and (Test-Path -LiteralPath $Candidate)) { $Browser=$Candidate; break } }
    }
    if (-not $Browser) { throw '没有找到 Chrome 或 Edge。未进行任何浏览器安装。' }
    $Profile = Join-Path $TodoRoot '.runtime\browser-profile'
    $Cache = Join-Path $TodoRoot '.runtime\browser-cache'
    $Backup = Join-Path $TodoRoot 'Data_BackUp'
    foreach ($Dir in @($Profile,$Cache,$Backup,(Join-Path $Profile 'Default'))) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }
    $Running = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Profile) }
    if (-not $Running) {
        $PreferenceFile = Join-Path $Profile 'Default\Preferences'
        $Preferences = if (Test-Path -LiteralPath $PreferenceFile) { Get-Content -LiteralPath $PreferenceFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { [PSCustomObject]@{} }
        $Download = [PSCustomObject]@{default_directory=$Backup;prompt_for_download=$false;directory_upgrade=$true}
        $Preferences | Add-Member -MemberType NoteProperty -Name download -Value $Download -Force
        $Preferences | Add-Member -MemberType NoteProperty -Name savefile -Value ([PSCustomObject]@{default_directory=$Backup}) -Force
        [IO.File]::WriteAllText($PreferenceFile,($Preferences | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
    }
    if ($NoBrowser) { Write-Output ('To-Do ready. PID=' + $Health.pid + ' Profile=' + $Profile); exit 0 }
    Start-Process -FilePath $Browser -ArgumentList @('--user-data-dir="' + $Profile + '"','--disk-cache-dir="' + $Cache + '"','--no-first-run','--no-default-browser-check','--disable-background-mode','--disable-crash-reporter','--app=http://127.0.0.1:4173') -WindowStyle Hidden | Out-Null
} catch {
    if ($NoBrowser) { Write-Error $_.Exception.Message; exit 1 }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message,'To-Do 启动失败','OK','Error') | Out-Null
    exit 1
}
