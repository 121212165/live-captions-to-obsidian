# watch-window.ps1
# Standalone script: polls for Live Captions window existence.
# Communicates via stdin/stdout JSON with a Node.js parent process.

#Requires -Version 5.1
[CmdletBinding()]
param()

Import-Module "$PSScriptRoot\uia-common.psm1"

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Force UTF-8 output so Node.js receives correctly encoded text
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ── Error trap ─────────────────────────────────────────────────────────────────
trap {
    $errObj = @{
        type     = "fatal"
        message  = $_.Exception.Message
        line     = $_.InvocationInfo.ScriptLineNumber
        category = $_.CategoryInfo.Category.ToString()
    }
    [Console]::Error.WriteLine($errObj | ConvertTo-Json -Compress)
    [Console]::Error.Flush()
    exit 1
}

# ── Command: watch ────────────────────────────────────────────────────────────

function Invoke-Watch {
    param(
        [string]$Title,
        [int]$Interval
    )

    $iteration = 0

    while ($true) {
        $found = $false
        $window = Find-LiveCaptionsWindow -Title $Title
        if ($window) {
            $found = $true
        }

        $statusObj = @{ type = "status"; found = $found }
        $statusObj | ConvertTo-Json -Compress | ForEach-Object { Send-Json $_ }

        $iteration++

        # Every 10 iterations send a heartbeat
        if ($iteration % 10 -eq 0) {
            $heartbeatObj = @{ type = "heartbeat" }
            $heartbeatObj | ConvertTo-Json -Compress | ForEach-Object { Send-Json $_ }
        }

        # Wait for the interval, checking for commands in between
        $deadline = [DateTime]::UtcNow.AddMilliseconds($Interval)
        while ([DateTime]::UtcNow -lt $deadline) {
            $line = Read-StdinLine -TimeoutMs 200
            if ($line) {
                $cmd = $null
                try { $cmd = $line | ConvertFrom-Json } catch {}
                if ($cmd -and $cmd.cmd -eq 'exit') {
                    return
                }
            }
        }
    }
}

# ── Main loop ────────────────────────────────────────────────────────────────

while ($true) {
    $rawLine = Read-StdinLine -TimeoutMs 500

    if ($null -eq $rawLine) {
        # Check if stdin stream has closed (parent process died)
        if ([Console]::In.Peek() -lt 0) {
            exit 0
        }
        continue
    }

    if ($rawLine.Trim().Length -eq 0) {
        continue
    }

    $parsed = $null
    try {
        $parsed = $rawLine | ConvertFrom-Json
    } catch {
        $errorObj = @{ type = "error"; message = "Invalid JSON: $rawLine" }
        $errorObj | ConvertTo-Json -Compress | ForEach-Object { Send-Json $_ }
        continue
    }

    switch ($parsed.cmd) {
        'watch' {
            $title   = if ($parsed.title)   { $parsed.title }   else { '实时字幕' }
            $interval = if ($parsed.interval) { [int]$parsed.interval } else { 2000 }
            Invoke-Watch -Title $title -Interval $interval
        }
        'exit' {
            exit 0
        }
        default {
            $errorObj = @{ type = "error"; message = "Unknown command: $($parsed.cmd)" }
            $errorObj | ConvertTo-Json -Compress | ForEach-Object { Send-Json $_ }
        }
    }
}
