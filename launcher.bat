@echo off
title Live Captions to Obsidian

:: Start capture tool in background (hidden)
start /min "" wscript.exe "%~dp0start-hidden.vbs"

:: Wait a moment for the tool to initialize
timeout /t 2 /nobreak >nul

:: Simulate Win+Ctrl+L to open Live Captions
powershell -NoProfile -Command ^
  "$sig = '[DllImport(\"user32.dll\")]public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);';" ^
  "$kb = Add-Type -MemberDefinition $sig -Name KB -Namespace W32 -PassThru;" ^
  "$kb::keybd_event(0x5B,0,0,0); $kb::keybd_event(0x11,0,0,0); $kb::keybd_event(0x4C,0,0,0);" ^
  "Start-Sleep -Milliseconds 100;" ^
  "$kb::keybd_event(0x4C,0,2,0); $kb::keybd_event(0x11,0,2,0); $kb::keybd_event(0x5B,0,2,0)"

echo.
echo Live Captions + capture tool started!
echo Close this window when done.
pause
