param([Parameter(Mandatory=$true)][string]$Profile)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RestWindow {
  public delegate bool EnumProc(IntPtr w, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr w);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr w);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr w, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr w, int i);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr w, int c);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr w, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint f, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool SwitchDesktop(IntPtr d);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr d);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int cb; public Rect monitor,work; public uint flags; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr w, out Rect r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr w, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MonitorInfo info);
  public static bool DesktopReady() { var d=OpenInputDesktop(0,false,0x100); if(d==IntPtr.Zero)return false; try{return SwitchDesktop(d);}finally{CloseDesktop(d);} }
  public static bool Fullscreen(IntPtr w) {
    if(w==IntPtr.Zero || (GetWindowLong(w,-16)&0x00C00000)!=0)return false;
    var cls=new StringBuilder(256); GetClassName(w,cls,256); if(cls.ToString()=="WorkerW" || cls.ToString()=="Progman")return false;
    Rect r; var m=new MonitorInfo(); m.cb=Marshal.SizeOf(m);
    return GetWindowRect(w,out r) && GetMonitorInfo(MonitorFromWindow(w,2),ref m) && r.L<=m.monitor.L && r.T<=m.monitor.T && r.R>=m.monitor.R && r.B>=m.monitor.B;
  }
  public static long[] Find(int[] pids) {
    var found=new List<long>(); var allowed=new HashSet<int>(pids);
    EnumWindows((w,p)=>{uint id; GetWindowThreadProcessId(w,out id); var cls=new StringBuilder(256); GetClassName(w,cls,256);
      if(allowed.Contains((int)id)&&IsWindowVisible(w)&&cls.ToString()=="Chrome_WidgetWin_1")found.Add(w.ToInt64()); return true;},IntPtr.Zero);
    return found.ToArray();
  }
}
'@
$Raised = @{}
$Recent = @{}
function Wait-RestWindow([IntPtr]$Window, [uint32]$ExpectedOwner, [bool]$RequireTopmost, [int]$TimeoutMs) {
    $Watch = [Diagnostics.Stopwatch]::StartNew()
    do {
        [uint32]$ActualOwner = 0
        [void][RestWindow]::GetWindowThreadProcessId($Window,[ref]$ActualOwner)
        if ($ActualOwner -ne $ExpectedOwner) { throw 'To-Do window closed or changed during restore' }
        $Minimized = [RestWindow]::IsIconic($Window)
        $Visible = [RestWindow]::IsWindowVisible($Window)
        $Topmost = ([RestWindow]::GetWindowLong($Window,-20) -band 8) -ne 0
        if ($Visible -and -not $Minimized -and (-not $RequireTopmost -or $Topmost)) { return }
        if ($Watch.ElapsedMilliseconds -ge $TimeoutMs) {
            $Stage = if ($RequireTopmost) { 'Window topmost verification timed out' } else { 'Window restore timed out' }
            throw ($Stage + ' (minimized=' + $Minimized + ', visible=' + $Visible + ', topmost=' + $Topmost + ', elapsedMs=' + $Watch.ElapsedMilliseconds + ', hwnd=' + $Window.ToInt64() + ', pid=' + $ExpectedOwner + ')')
        }
        Start-Sleep -Milliseconds 50
    } while ($true)
}
function Restore-Windows {
    foreach ($Key in @($Raised.Keys)) {
        $Entry = $Raised[$Key]
        $Window = [IntPtr][long]$Key
        [uint32]$Owner = 0
        [void][RestWindow]::GetWindowThreadProcessId($Window,[ref]$Owner)
        if ($Owner -eq $Entry.Owner) {
            $After = if ($Entry.Topmost) { -1 } else { -2 }
            if (-not [RestWindow]::SetWindowPos($Window,[IntPtr]$After,0,0,0,0,0x13)) { throw 'Cannot restore window order' }
            if ((([RestWindow]::GetWindowLong($Window,-20) -band 8) -ne 0) -ne $Entry.Topmost) { throw 'Window order restore verification failed' }
        }
        $Raised.Remove($Key)
    }
}
try {
    while ($null -ne ($Line = [Console]::ReadLine())) {
        try {
            $Command = $Line | ConvertFrom-Json
            if ($Command.action -eq 'release') { Restore-Windows; @{ok=$true} | ConvertTo-Json -Compress; continue }
            if ($Command.action -notin @('probe','raise')) { throw 'Unsupported window action' }
            $Processes = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" | Where-Object {
                $_.CommandLine -and ($_.CommandLine.Contains('--user-data-dir="' + $Profile + '"') -or $_.CommandLine.Contains('"--user-data-dir=' + $Profile + '"'))
            })
            $Ids = [int[]]@($Processes | ForEach-Object { [int]$_.ProcessId })
            $Windows = @([RestWindow]::Find($Ids))
            $Foreground = [RestWindow]::GetForegroundWindow().ToInt64()
            if ($Windows -contains $Foreground) { $Recent[$Foreground] = [DateTime]::UtcNow.Ticks }
            $Ready = [RestWindow]::DesktopReady()
            $Blocked = $Ready -and ($Windows -notcontains $Foreground) -and [RestWindow]::Fullscreen([IntPtr]$Foreground)
            $Result = @{ok=$true; count=$Windows.Count; ready=($Ready -and -not $Blocked); topmostCount=@($Windows | Where-Object { ([RestWindow]::GetWindowLong([IntPtr]$_,-20) -band 8) -ne 0 }).Count}
            if ($Command.action -eq 'raise' -and $Result.ready) {
                if (-not $Windows.Count) { throw 'No dedicated To-Do window found' }
                $Handle = [long]($Windows | Sort-Object { $Recent[$_] } -Descending | Select-Object -First 1)
                $Window = [IntPtr]$Handle
                if (-not $Raised.ContainsKey($Handle)) {
                    [uint32]$Owner = 0
                    [void][RestWindow]::GetWindowThreadProcessId($Window,[ref]$Owner)
                    $Raised[$Handle] = @{Owner=$Owner; Topmost=(([RestWindow]::GetWindowLong($Window,-20) -band 8) -ne 0)}
                }
                if ([RestWindow]::IsIconic($Window)) {
                    if (-not [RestWindow]::ShowWindowAsync($Window,9)) { throw 'Window restore request could not be started' }
                }
                Wait-RestWindow $Window $Raised[$Handle].Owner $false 3000
                # Queue the z-order change without blocking on the browser's UI thread.
                if (-not [RestWindow]::SetWindowPos($Window,[IntPtr](-1),0,0,0,0,0x4053)) { throw 'Window topmost request could not be started' }
                Wait-RestWindow $Window $Raised[$Handle].Owner $true 2000
                $Result.verified = $true
            }
            $Result | ConvertTo-Json -Compress
        } catch {
            [Console]::Error.WriteLine(([DateTime]::UtcNow.ToString('o') + ' Rest window: ' + $_.Exception.Message))
            @{ok=$false; error=$_.Exception.Message} | ConvertTo-Json -Compress
        }
    }
} finally { Restore-Windows }
