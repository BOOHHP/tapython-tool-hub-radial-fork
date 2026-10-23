# apply-deployment.ps1 — server-side deployment apply script
# Runs ON THE SERVER (10.2.13.8) after files have been synced from a dev machine.
# Responsibilities:
#   1. Verify .env admin config exists (never overwritten by deploy).
#   2. npm ci (only when package-lock.json changed, tracked via stamp file).
#   3. Stop old node processes belonging to this repo.
#   4. Start the single-process production service directly.
#   5. Health check the API.
#
# Usage (on server, from repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\server\apply-deployment.ps1 [-HostIp 10.2.13.8] [-ApiPort 8787] [-ForceNpmCi]

param(
    [string]$HostIp = '10.2.13.8',
    [int]$WebPort = 8787,
    [int]$ApiPort = 8787,
    [ValidateSet('dual', 'single')]
    [string]$Mode = 'single',
    [switch]$ForceNpmCi,
    [switch]$SkipBackup,
    [switch]$FromTrigger
)

$ErrorActionPreference = 'Stop'

# ── Resolve repo root (must be a local disk path, not UNC) ──
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# ── Trigger-file mode: consume .deploy-trigger for parameters ──
if ($FromTrigger) {
    $triggerFile = Join-Path $repoRoot '.deploy-trigger'
    if (-not (Test-Path $triggerFile)) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/health" -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                # No pending deploy and the production service is healthy.
                exit 0
            }
        } catch { }

        # The startup trigger and minute poll both use this path to recover a
        # stopped service without restarting an already healthy instance.
        $Mode = 'single'
        $WebPort = $ApiPort
    }
    else {
        foreach ($line in Get-Content -LiteralPath $triggerFile) {
            if ($line -match '^\s*HostIp\s*=\s*(.+)$')      { $HostIp  = $Matches[1].Trim() }
            if ($line -match '^\s*WebPort\s*=\s*(\d+)')     { $WebPort = [int]$Matches[1] }
            if ($line -match '^\s*ApiPort\s*=\s*(\d+)')     { $ApiPort = [int]$Matches[1] }
            if ($line -match '^\s*Mode\s*=\s*(\S+)')        { $Mode    = $Matches[1].Trim() }
        }
        # Delete the trigger immediately so the next poll is a no-op
        # even if the apply itself fails (deploy-local.bat can re-trigger).
        Remove-Item -LiteralPath $triggerFile -Force
    }
}
if ($repoRoot.StartsWith('\\')) {
    Write-Error "[apply-deployment] ERROR: repo is on a UNC path ($repoRoot). npm workspace junctions cannot resolve over SMB. See docs/windows-unc-deployment.md"
    exit 1
}
Set-Location -LiteralPath $repoRoot

$stampFile = Join-Path $repoRoot '.deploy-stamp'
$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$applyLog = Join-Path $logDir 'apply-deployment.log'

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $applyLog -Value $line
}

Write-Log "=== apply-deployment started (mode=$Mode, host=$HostIp, web=$WebPort, api=$ApiPort) ==="

# ── 1. Verify .env admin config ──
$envFile = Join-Path $repoRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Log "ERROR: .env not found at $envFile. Copy .env.example and configure admin credentials first."
    exit 1
}
$envText = Get-Content -LiteralPath $envFile -Raw
foreach ($key in @('ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'AUTH_SESSION_SECRET')) {
    if ($envText -notmatch "(?m)^\s*$key\s*=\s*\S") {
        Write-Log "ERROR: .env is missing a non-empty value for $key."
        exit 1
    }
}
Write-Log ".env admin config verified."

# ── 2. npm ci (skip when lockfile unchanged) ──
$lockfile = Join-Path $repoRoot 'package-lock.json'
$lockHash = $null
if (Test-Path $lockfile) {
    $lockHash = (Get-FileHash -LiteralPath $lockfile -Algorithm SHA256).Hash
}
$needsCi = $ForceNpmCi -or -not (Test-Path $stampFile) -or $null -eq $lockHash
if (-not $needsCi) {
    $prevStamp = Get-Content -LiteralPath $stampFile -ErrorAction SilentlyContinue
    $needsCi = ($prevStamp -ne $lockHash)
}

if ($needsCi) {
    Write-Log "Running npm ci (lockfile changed or first run)..."
    # Use npm.cmd explicitly: when launched by the Task Scheduler under
    # SYSTEM, PATH resolution for "npm" can hit a broken shim that reports
    # 'Unknown command: "pm"'.
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmCmd) { $npmCmd = 'npm.cmd' }
    $npmOutput = & $npmCmd ci 2>&1
    if ($LASTEXITCODE -ne 0) {
        $npmOutput | ForEach-Object { Write-Log "  npm: $_" }
        Write-Log "ERROR: npm ci failed with exit code $LASTEXITCODE."
        exit 1
    }
    Write-Log "npm ci completed."
    if ($null -ne $lockHash) {
        Set-Content -LiteralPath $stampFile -Value $lockHash
    }
} else {
    Write-Log "package-lock.json unchanged since last deploy, skipping npm ci."
}

# ── 2b. Pre-deploy backup (fail closed: nothing is stopped if the backup fails) ──
if ($SkipBackup) {
    Write-Log "Pre-deploy backup skipped (-SkipBackup)."
} else {
    $nodeCmd = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeCmd) { $nodeCmd = 'node.exe' }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $backupOutput = & $nodeCmd --no-warnings (Join-Path $repoRoot 'scripts\server\backup.mjs') --kind deploy 2>&1
    $backupExit = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    $backupOutput | ForEach-Object { Write-Log "  backup: $_" }
    if ($backupExit -ne 0) {
        Write-Log "ERROR: pre-deploy backup failed (exit $backupExit); deployment aborted before touching the running service."
        exit 1
    }
}

# ── 3. Stop old service processes ──
Write-Log "Stopping previous service processes..."

# User-session processes may be invisible to the scheduled task's WMI query.
# The listening port is the authoritative ownership signal for this service.
foreach ($port in @($ApiPort, $WebPort)) {
    $listeners = netstat -ano -p tcp | Select-String ":$port\s+.*LISTENING\s+(\d+)\s*$"
    foreach ($listener in $listeners) {
        $processId = [int]$listener.Matches[0].Groups[1].Value
        if ($processId -gt 0 -and $processId -ne $PID) {
            Write-Log "  stopping listener on port $port (PID $processId)"
            & taskkill.exe /PID $processId /T /F | Out-Null
        }
    }
}

# Keep the repo-path sweep for detached child processes that no longer own a
# listening port (for example, a failed preview process).
$repoPathLower = $repoRoot.ToLowerInvariant()
$killed = 0
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
    $cmdLine = $_.CommandLine
    if ($cmdLine -and $cmdLine.ToLowerInvariant().Contains($repoPathLower)) {
        Write-Log "  stopping PID $($_.ProcessId): $($cmdLine.Substring(0, [Math]::Min(120, $cmdLine.Length)))"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $script:killed++
    }
}
if ($killed -eq 0) {
    Write-Log "  no running node processes found for this repo."
} else {
    Start-Sleep -Seconds 2
}

# ── 3b. One-time submissions migration (only when .env opts in with STORE_BACKEND=sqlite) ──
# The service is stopped here, so no submission can change between import and start.
# Any failure falls back to the file store for this run instead of leaving the service down.
function Get-EnvValue([string]$Key) {
    if ($envText -match "(?m)^\s*$Key\s*=\s*(.*?)\s*$") { return $Matches[1].Trim('"', "'") }
    return $null
}
$storeOverride = ''
if ((Get-EnvValue 'STORE_BACKEND') -eq 'sqlite') {
    $sqlitePath = Get-EnvValue 'SQLITE_PATH'
    $submissionRoot = Get-EnvValue 'SUBMISSION_ROOT'
    if (-not $submissionRoot) { $submissionRoot = Join-Path $repoRoot '.tapython-tool-hub\submissions' }
    $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) { $nodeExe = 'node.exe' }
    $migrationCli = Join-Path $repoRoot 'apps\api\dist\migration\cli.js'
    if (-not $sqlitePath -or -not (Test-Path $migrationCli)) {
        Write-Log "ERROR: STORE_BACKEND=sqlite needs SQLITE_PATH and a built migration CLI; falling back to file storage for this run."
        $storeOverride = 'set STORE_BACKEND=files&& '
    } else {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $migrationOutput = & $nodeExe --no-warnings $migrationCli migrate --sqlite $sqlitePath --submissions $submissionRoot 2>&1
        $migrationExit = $LASTEXITCODE
        $ErrorActionPreference = $previousPreference
        $migrationOutput | ForEach-Object { Write-Log "  migrate: $_" }
        if ($migrationExit -ne 0) {
            Write-Log "ERROR: submissions migration failed (exit $migrationExit); starting with file storage. Nothing was written to the database."
            $storeOverride = 'set STORE_BACKEND=files&& '
        } else {
            Write-Log "Submissions migration step finished."
        }
    }
}

# ── 4. Start production services ──
# Use SINGLE mode: the API process (node/Fastify) serves both the static web
# build and the API on one port. vite preview is NOT used because it exits
# when stdin closes (no TTY under the Task Scheduler), killing the web app.
Write-Log "Starting production service (single mode: API serves static web)..."
$apiLogPath = Join-Path $logDir 'api.log'

$apiCmd = "cmd.exe /c `"${storeOverride}set SERVE_STATIC=true&& set API_HOST=0.0.0.0&& set API_PORT=$ApiPort&& npm run start -w @tapython-tool-hub/api >> `"$apiLogPath`" 2>&1`""
$apiResult = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $apiCmd; CurrentDirectory = $repoRoot }
Write-Log "  API(static) create result: $($apiResult.ReturnValue) PID=$($apiResult.ProcessId)"

# ── 5. Health check ──
Write-Log "Waiting for API health check..."
$healthUrl = "http://127.0.0.1:$ApiPort/api/health"
$healthy = $false
for ($i = 1; $i -le 120; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}

if ($healthy) {
    Write-Log "API is healthy after ${i}s."
    try {
        & (Join-Path $repoRoot 'scripts\server\install-backup-task.ps1') | ForEach-Object { Write-Log "  $_" }
    } catch {
        Write-Log "WARNING: could not register the daily backup task: $($_.Exception.Message)"
    }
    Write-Log "=== apply-deployment finished successfully ==="
    Write-Log "web/api: http://${HostIp}:${ApiPort}/ (single mode)"
    exit 0
} else {
    Write-Log "WARNING: API health check timed out after 120s. Check logs\api.log"
    exit 2
}
