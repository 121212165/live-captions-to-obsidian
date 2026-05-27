# uia-common.psm1
# Shared module for UIA-based Live Captions interaction.

[CmdletBinding()]
param()

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

# ── Load UI Automation assemblies ──────────────────────────────────────────────
try {
    Add-Type -AssemblyName 'UIAutomationClient'
    Add-Type -AssemblyName 'UIAutomationTypes'
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

    if ($Title.Length -gt 256) {
        throw "Title parameter exceeds maximum length of 256 characters"
    }

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

    if ($Title.Length -gt 256) {
        throw "Title parameter exceeds maximum length of 256 characters"
    }

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

    if ($TimeoutMs -lt 100) {
        throw "TimeoutMs parameter must be at least 100ms"
    }

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

Export-ModuleMember -Function Send-Json, Read-StdinLine, Find-LiveCaptionsWindow, Get-CaptionText
