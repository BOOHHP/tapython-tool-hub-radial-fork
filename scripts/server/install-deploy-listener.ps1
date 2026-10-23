# install-deploy-listener.ps1 — ONE-TIME setup on the deployment server.
# Creates a scheduled task that watches for .deploy-trigger in the repo root
# and runs apply-deployment.ps1 when a deploy is pushed from a dev machine.
#
# Run ON THE SERVER, from the repo root, in an elevated PowerShell:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\server\install-deploy-listener.ps1
#
# The task runs at system startup and every minute. It applies pending deploys,
# recovers a stopped service, and exits quickly when the service is healthy.

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$TaskName = 'TapythonToolHub-DeployListener'
)

$ErrorActionPreference = 'Stop'

if ($RepoRoot.StartsWith('\\')) {
    Write-Error "Repo is on a UNC path ($RepoRoot). Run this script from the server's local disk path."
    exit 1
}

$applyScript = Join-Path $RepoRoot 'scripts\server\apply-deployment.ps1'
if (-not (Test-Path $applyScript)) {
    Write-Error "apply-deployment.ps1 not found at $applyScript"
    exit 1
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument `
    "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$applyScript`" -FromTrigger" `
    -WorkingDirectory $RepoRoot

$pollTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$triggers = @($pollTrigger, $startupTrigger)

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "[install-deploy-listener] scheduled task '$TaskName' registered."
Write-Host "[install-deploy-listener] repo root: $RepoRoot"
Write-Host "[install-deploy-listener] it runs at startup and every minute to apply deploys or recover the service."
Write-Host "[install-deploy-listener] verify with: Get-ScheduledTask -TaskName $TaskName"
