# Registers the daily backup on the server (run once, elevated). Writes under ..\deploy-backups\<repo>\daily, keeps 30.
param(
    [string]$TaskName = 'TapythonToolHub-DailyBackup',
    [string]$At = '03:00'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $node)) { throw "node.exe not found (looked in PATH and $node)" }
$script = Join-Path $repoRoot 'scripts\server\backup.mjs'

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --kind daily" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $At
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host "Registered $TaskName daily at $At -> $script"
