@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM deploy-local.bat - deploy local build directly to the LAN
REM server share, bypassing the GitHub round-trip.
REM
REM Flow:
REM   1. Build locally (web + api).
REM   2. robocopy source + build artifacts to \\SERVER\Server\SUBDIR.
REM      (.env / logs / .tapython-tool-hub / node_modules / .git are
REM      preserved on the server and never overwritten.)
REM   3. Trigger server-side apply:
REM        - WinRM (Invoke-Command) when reachable
REM        - fallback: write .deploy-trigger; a scheduled task on the
REM          server (install-deploy-listener.ps1, one-time setup)
REM          picks it up within ~1 minute and runs apply-deployment.ps1
REM
REM Usage:
REM   scripts\deploy-local.bat
REM   scripts\deploy-local.bat [SERVER] [SUBDIR] [LOCAL_ROOT] [WEB_PORT] [API_PORT] [MODE]
REM   scripts\deploy-local.bat 10.2.13.8 tapython-tool-hub-radial-fork D:\Server\tapython-tool-hub-radial-fork 8787 8787 single
REM ============================================================

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

set "SERVER=%~1"
if "%SERVER%"=="" set "SERVER=10.2.13.8"

set "SHARE_NAME=Server"
set "SUBDIR=%~2"
if "%SUBDIR%"=="" set "SUBDIR=tapython-tool-hub-radial-fork"

set "LOCAL_ROOT=%~3"
if "%LOCAL_ROOT%"=="" set "LOCAL_ROOT=D:\Server\%SUBDIR%"

set "WEB_PORT=%~4"
if "%WEB_PORT%"=="" set "WEB_PORT=8787"

set "API_PORT=%~5"
if "%API_PORT%"=="" set "API_PORT=8787"

set "MODE=%~6"
if "%MODE%"=="" set "MODE=single"

set "UNC_TARGET=\\%SERVER%\%SHARE_NAME%\%SUBDIR%"
set "TRIGGER_FILE=%UNC_TARGET%\.deploy-trigger"

echo [deploy-local] repo root:   %REPO_ROOT%
echo [deploy-local] target:      %UNC_TARGET%
echo [deploy-local] server path: %LOCAL_ROOT%
echo [deploy-local] mode:        %MODE% (web=%WEB_PORT%, api=%API_PORT%)

where robocopy >nul 2>&1
if errorlevel 1 (
    echo [deploy-local] ERROR: robocopy not found in PATH.
    exit /b 1
)

REM -- Step 0: verify the share is reachable ------------------
echo [deploy-local] step 0/4: checking share reachability...
if not exist "%UNC_TARGET%\" (
    echo [deploy-local] ERROR: cannot access %UNC_TARGET%
    echo [deploy-local] Check network/credentials, or try: net use \\%SERVER%\%SHARE_NAME% /user:DOMAIN\user
    exit /b 1
)

REM Server-authored tool sources live in data\tool-docs (published via the
REM submission/review flow) and do not exist in the local dev repo. Pull them
REM down before building so generated API/download artifacts include them,
REM then merge local additions back during the mirror step.
echo [deploy-local] step 1/4: pulling server-authored tool docs and building locally...
echo [deploy-local] pulling server-authored tool docs before build...
robocopy "%UNC_TARGET%\data\tool-docs" "%REPO_ROOT%\data\tool-docs" /E /NFL /NDL /NJH /NJS /NP
set "RC=%errorlevel%"
if %RC% GEQ 8 (
    echo [deploy-local] ERROR: failed to pull server tool docs, code %RC%.
    exit /b %RC%
)

call npm run build
if errorlevel 1 goto :build_fail
call npm run build:api
if errorlevel 1 goto :build_fail

REM -- Step 2: sync files -------------------------------------
echo [deploy-local] step 2/4: syncing files to %UNC_TARGET% ...

REM Source code + configs. /MIR mirrors the tree, but server-side
REM runtime data is excluded so it is never touched or deleted.
robocopy "%REPO_ROOT%" "%UNC_TARGET%" /MIR ^
    /XD node_modules .git dist .tapython-tool-hub logs graphify-out ^
    /XF .env .deploy-trigger .deploy-stamp ^
    /NFL /NDL /NJH /NJS /NP
set "RC=%errorlevel%"
if %RC% GEQ 8 (
    echo [deploy-local] ERROR: robocopy failed with code %RC%.
    exit /b %RC%
)

REM Build artifacts (web dist + api dist)
robocopy "%REPO_ROOT%\dist" "%UNC_TARGET%\dist" /MIR /NFL /NDL /NJH /NJS /NP
set "RC=%errorlevel%"
if %RC% GEQ 8 (
    echo [deploy-local] ERROR: robocopy dist failed with code %RC%.
    exit /b %RC%
)
robocopy "%REPO_ROOT%\apps\api\dist" "%UNC_TARGET%\apps\api\dist" /MIR /NFL /NDL /NJH /NJS /NP
set "RC=%errorlevel%"
if %RC% GEQ 8 (
    echo [deploy-local] ERROR: robocopy api dist failed with code %RC%.
    exit /b %RC%
)

REM Workspace package build outputs - the top-level /MIR excludes only the
REM root dist, so packages\*\dist must be synced explicitly or the server
REM keeps running stale shared/tooling/cli code.
for %%P in (shared tooling cli) do (
    if exist "%REPO_ROOT%\packages\%%P\dist" (
        if not exist "%UNC_TARGET%\packages\%%P\dist" mkdir "%UNC_TARGET%\packages\%%P\dist" >nul 2>&1
        robocopy "%REPO_ROOT%\packages\%%P\dist" "%UNC_TARGET%\packages\%%P\dist" /MIR /NFL /NDL /NJH /NJS /NP
        set "RC=%errorlevel%"
        if !RC! GEQ 8 (
            echo [deploy-local] ERROR: robocopy packages\%%P\dist failed with code !RC!.
            exit /b !RC!
        )
    )
)
echo [deploy-local] sync complete.

REM -- Step 3: trigger server-side apply ----------------------
echo [deploy-local] step 3/4: triggering server-side apply...

REM Try WinRM first (works when TrustedHosts/credentials are configured)
powershell -NoProfile -Command "try { $s = New-PSSession -ComputerName %SERVER% -ErrorAction Stop; Remove-PSSession $s; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [deploy-local] WinRM available, invoking apply-deployment.ps1 remotely...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$job = Invoke-Command -ComputerName %SERVER% -ScriptBlock { powershell -NoProfile -ExecutionPolicy Bypass -File '%LOCAL_ROOT%\scripts\server\apply-deployment.ps1' -HostIp %SERVER% -WebPort %WEB_PORT% -ApiPort %API_PORT% -Mode %MODE% } -AsJob; Wait-Job $job -Timeout 600 | Out-Null; Receive-Job $job; $st = $job.State; Remove-Job $job -Force; if ($st -eq 'Failed') { exit 1 } else { exit 0 }"
    if errorlevel 1 goto :apply_fail
    goto :apply_done
)

REM Fallback: trigger file + scheduled task on the server
echo [deploy-local] WinRM not available, using trigger-file fallback...
REM robocopy leaves errorlevel 1-7 on success; reset before writing.
cmd /c exit 0
> "%TRIGGER_FILE%" (
    echo HostIp=%SERVER%
    echo WebPort=%WEB_PORT%
    echo ApiPort=%API_PORT%
    echo Mode=%MODE%
    echo RequestedAt=%date% %time%
)
if not exist "%TRIGGER_FILE%" goto :apply_fail
echo [deploy-local] trigger file written: %TRIGGER_FILE%
echo [deploy-local] the server-side scheduled task will pick it up within ~1 minute.
echo [deploy-local] monitor progress: type %UNC_TARGET%\logs\apply-deployment.log

:apply_done
echo [deploy-local] step 4/4: done.
echo [deploy-local] web: http://%SERVER%:%WEB_PORT%/
echo [deploy-local] api: http://%SERVER%:%API_PORT%/
exit /b 0

:build_fail
echo [deploy-local] ERROR: local build failed, nothing was deployed.
exit /b 1

:apply_fail
echo [deploy-local] ERROR: server-side apply failed or timed out.
echo [deploy-local] Check %UNC_TARGET%\logs\apply-deployment.log
exit /b 1
