@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

set "SERVER_HOST=%~1"
if "%SERVER_HOST%"=="" set "SERVER_HOST=127.0.0.1"

set "WEB_PORT=%~2"
if "%WEB_PORT%"=="" set "WEB_PORT=5174"

set "API_PORT=%~3"
if "%API_PORT%"=="" set "API_PORT=8787"

set "MODE=%~4"
if "%MODE%"=="" set "MODE=dual"

set "LOG_DIR=%REPO_ROOT%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [tapython-tool-hub] repo root: %REPO_ROOT%
echo [tapython-tool-hub] mode:      %MODE%
echo [tapython-tool-hub] host:      %SERVER_HOST%

if "%REPO_ROOT:~0,2%"=="\\" (
    echo [tapython-tool-hub] UNC path detected, mapping to drive letter via pushd...
    pushd "%REPO_ROOT%"
    if errorlevel 1 (
        echo [tapython-tool-hub] ERROR: failed to map UNC path to drive letter.
        exit /b 1
    )
    for %%%%I in (".") do set "REPO_ROOT=%%%%~fI"
    set "LOG_DIR=!REPO_ROOT!\logs"
    echo [tapython-tool-hub] mapped to: !REPO_ROOT!
)

if /i "%MODE%"=="single" goto :single_mode

REM === Dual-process mode (default) ===
set "VITE_API_BASE_URL=auto"
set "API_HOST=0.0.0.0"

echo [tapython-tool-hub] building web with runtime API auto-detection
echo [tapython-tool-hub] api will listen on %API_HOST%:%API_PORT%
echo [tapython-tool-hub] web preview will listen on 0.0.0.0:%WEB_PORT%
echo [tapython-tool-hub] logs will be written to %LOG_DIR%\

call npm run build
if errorlevel 1 goto :fail

call npm run build:api
if errorlevel 1 goto :fail

echo [tapython-tool-hub] starting API window...
start "tapython-tool-hub api" powershell -NoExit -NoProfile -Command "Set-Location -LiteralPath '%REPO_ROOT%'; $env:API_HOST='%API_HOST%'; $env:API_PORT='%API_PORT%'; npm run start -w @tapython-tool-hub/api 2>&1 | Tee-Object -FilePath '%LOG_DIR%\api.log'"

echo [tapython-tool-hub] starting Web window...
start "tapython-tool-hub web" powershell -NoExit -NoProfile -Command "Set-Location -LiteralPath '%REPO_ROOT%'; npm run preview -w @tapython-tool-hub/web -- --host 0.0.0.0 --port %WEB_PORT% 2>&1 | Tee-Object -FilePath '%LOG_DIR%\web.log'"

echo [tapython-tool-hub] started (dual mode).
echo [tapython-tool-hub] local web:  http://127.0.0.1:%WEB_PORT%/
echo [tapython-tool-hub] lan web:    http://%SERVER_HOST%:%WEB_PORT%/
echo [tapython-tool-hub] lan api:    http://%SERVER_HOST%:%API_PORT%/
echo [tapython-tool-hub] logs:       %LOG_DIR%\
goto :healthcheck

:single_mode
REM === Single-process mode ===
set "API_HOST=0.0.0.0"
REM The frontend resolves local/server API endpoints from the browser hostname.
set "VITE_API_BASE_URL=auto"

echo [tapython-tool-hub] building web with runtime API auto-detection...
call npm run build
if errorlevel 1 goto :fail

echo [tapython-tool-hub] building api...
call npm run build:api
if errorlevel 1 goto :fail

echo [tapython-tool-hub] starting API (single process, serving static) on %API_HOST%:%API_PORT%...
echo [tapython-tool-hub] logs will be written to %LOG_DIR%\
start "tapython-tool-hub" powershell -NoExit -NoProfile -Command "Set-Location -LiteralPath '%REPO_ROOT%'; $env:SERVE_STATIC='true'; $env:API_HOST='%API_HOST%'; $env:API_PORT='%API_PORT%'; npm run start -w @tapython-tool-hub/api 2>&1 | Tee-Object -FilePath '%LOG_DIR%\api.log'"

echo [tapython-tool-hub] started (single mode).
echo [tapython-tool-hub] local:  http://127.0.0.1:%API_PORT%/
echo [tapython-tool-hub] lan:    http://%SERVER_HOST%:%API_PORT%/
echo [tapython-tool-hub] logs:   %LOG_DIR%\
goto :healthcheck

:healthcheck
echo [tapython-tool-hub] waiting for API to be ready...
set "HEALTH_URL=http://127.0.0.1:%API_PORT%/api/health"
set "HEALTH_OK=0"
for /L %%i in (1,1,30) do (
    if "!HEALTH_OK!"=="0" (
        timeout /t 1 /nobreak >nul 2>&1
        powershell -Command "try { $r = Invoke-WebRequest -Uri '!HEALTH_URL!' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
        if !errorlevel! equ 0 (
            set "HEALTH_OK=1"
            echo [tapython-tool-hub] API is ready! ✓
        )
    )
)
if "!HEALTH_OK!"=="0" (
    echo [tapython-tool-hub] WARNING: API health check timed out after 30s. Service may not be ready.
    echo [tapython-tool-hub] Check logs in %LOG_DIR% for errors.
)
goto :eof

:fail
echo [tapython-tool-hub] startup failed with exit code %errorlevel%.
exit /b %errorlevel%

:unc_not_supported
echo [tapython-tool-hub] ERROR: failed to handle UNC workspace path.
exit /b 1
