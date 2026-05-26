# uia-capture.ps1
# Communicates via stdin/stdout JSON with a Node.js parent process.
# Uses Windows UI Automation to interact with the Live Captions window.

#Requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Force UTF-8 output so Node.js receives correctly encoded text
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ── Load UI Automation assemblies ──────────────────────────────────────────────
try {
    [System.Reflection.Assembly]::LoadWithPartialName('UIAutomationClient') | Out-Null
    [System.Reflection.Assembly]::LoadWithPartialName('UIAutomationTypes') | Out-Null
} catch {
    Write-Error "Failed to load UIAutomation assemblies: $_"
    exit 1
}

# ── Helpers ───────────────────────────────────────────────────────────────────

function Send-Json {
    param([string]$Line)
    [Console]::Out.WriteLine($Line)
    [Console]::Out.Flush()
}

function Find-LiveCaptionsWindow {
    param([string]$Title)

    $root = [System.Windows.Automation.AutomationElement]::RootElement

    # Primary: find by window class name (encoding-safe, reliable)
    $classCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ClassNameProperty,
        'LiveCaptionsDesktopWindow'
    )
    $window = $root.FindFirst(
        [System.Windows.Automation.TreeScope]::Children,
        $classCondition
    )
    if ($window) { return $window }

    # Fallback: find by title substring
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Window
    )
    $windows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        $condition
    )
    foreach ($w in $windows) {
        try {
            $name = $w.Current.Name
            if ($name -and $name -like "*$Title*") {
                return $w
            }
        } catch { continue }
    }

    return $null
}

function Get-CaptionText {
    param([System.Windows.Automation.AutomationElement]$Window, [string]$Title)

    $textCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Text
    )

    try {
        $textElements = $Window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $textCondition
        )
    } catch {
        return $null
    }

    $lines = [System.Collections.Generic.List[string]]::new()

    foreach ($el in $textElements) {
        try {
            $name = $el.Current.Name
            if ($name -and $name.Trim().Length -gt 0 -and $name -ne $Title) {
                $lines.Add($name)
            }
        } catch {
            # Element may have been destroyed between find and read
            continue
        }
    }

    return $lines
}

function Read-StdinLine {
    <#
    .SYNOPSIS
        Non-blocking stdin read. Returns $null if no data is available within the timeout.
    #>
    param([int]$TimeoutMs = 100)

    if ([Console]::In.Peek() -lt 0) {
        return $null
    }

    try {
        $task = [Console]::In.ReadLineAsync()
        if ($task.Wait($TimeoutMs)) {
            return $task.Result
        }
        return $null
    } catch {
        return $null
    }
}

# ── Command: watch ────────────────────────────────────────────────────────────

function Invoke-Watch {
    param(
        [string]$Title,
        [int]$Interval
    )

    while ($true) {
        $found = $false
        $window = Find-LiveCaptionsWindow -Title $Title
        if ($window) {
            $found = $true
        }

        Send-Json ('{{"type":"status","found":{0}}}' -f ($found.ToString().ToLower()))

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
                # Other commands while watching are ignored
            }
        }
    }
}

# ── Command: capture ──────────────────────────────────────────────────────────

function Invoke-Capture {
    param(
        [string]$Title,
        [int]$Interval
    )

    while ($true) {
        $window = Find-LiveCaptionsWindow -Title $Title

        if (-not $window) {
            Send-Json '{"type":"gone"}'
            return
        }

        $lines = Get-CaptionText -Window $window -Title $Title

        if ($null -eq $lines) {
            # Window handle lost mid-read
            Send-Json '{"type":"gone"}'
            return
        }

        # Build JSON payload
        $payload = @{ type = 'text'; lines = $lines } | ConvertTo-Json -Compress
        Send-Json $payload

        # Wait for the interval, checking for commands
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
        Send-Json ('{{"type":"error","message":"Invalid JSON: {0}"}}' -f ($rawLine -replace '\\', '\\\\' -replace '"', '\"'))
        continue
    }

    switch ($parsed.cmd) {
        'watch' {
            $title = if ($parsed.title) { $parsed.title } else { '实时字幕' }
            $interval = if ($parsed.interval) { [int]$parsed.interval } else { 2000 }
            Invoke-Watch -Title $title -Interval $interval
        }
        'capture' {
            $title = if ($parsed.title) { $parsed.title } else { '实时字幕' }
            $interval = if ($parsed.interval) { [int]$parsed.interval } else { 500 }
            Invoke-Capture -Title $title -Interval $interval
        }
        'exit' {
            exit 0
        }
        default {
            Send-Json ('{{"type":"error","message":"Unknown command: {0}"}}' -f ($parsed.cmd -replace '\\', '\\\\' -replace '"', '\"'))
        }
    }
}
