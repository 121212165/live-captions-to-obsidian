# Live Captions to Obsidian — One-click launcher
# Starts capture tool + opens Live Captions in one action

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start capture tool in background (hidden)
$wscriptProc = Start-Process -FilePath "wscript.exe" -ArgumentList "`"$scriptDir\start-hidden.vbs`"" -WindowStyle Hidden -PassThru
Write-Host "[OK] Capture tool started in background" -ForegroundColor Green

# 2. Wait for tool to initialize
Start-Sleep -Seconds 2

# 3. Simulate Win+Ctrl+L to open Live Captions
$sig = '[DllImport("user32.dll")]public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);'
$kb = Add-Type -MemberDefinition $sig -Name KB -Namespace W32 -PassThru

$kb::keybd_event(0x5B, 0, 0, 0)   # Win down
$kb::keybd_event(0x11, 0, 0, 0)   # Ctrl down
$kb::keybd_event(0x4C, 0, 0, 0)   # L down
Start-Sleep -Milliseconds 100
$kb::keybd_event(0x4C, 0, 2, 0)   # L up
$kb::keybd_event(0x11, 0, 2, 0)   # Ctrl up
$kb::keybd_event(0x5B, 0, 2, 0)   # Win up

Write-Host "[OK] Live Captions opened" -ForegroundColor Green
Write-Host ""
Write-Host "Everything is running. Close this window." -ForegroundColor Yellow
Write-Host "Subtitles auto-save to: $env:USERPROFILE\Documents\Obsidian\notes\" -ForegroundColor Cyan

try {
    Read-Host "Press Enter to exit"
} finally {
    # Kill the background capture process on exit (including window close)
    if ($wscriptProc -and -not $wscriptProc.HasExited) {
        try { Stop-Process -Id $wscriptProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
}
