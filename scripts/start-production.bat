@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT"

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

if /i "%MODE%"=="single" goto :single_mode

REM === Dual-process mode (default) ===
set "VITE_API_BASE_URL=http://%SERVER_HOST%:%API_PORT%"
set "API_HOST=0.0.0.0"

echo [tapython-tool-hub] building web with VITE_API_BASE_URL=%VITE_API_BASE_URL%
echo [tapython-tool-hub] api will listen on %API_HOST%:%API_PORT%
echo [tapython-tool-hub] web preview will listen on 0.0.0.0:%WEB_PORT%

call npm run build
if errorlevel 1 goto :fail

call npm run build:api
if errorlevel 1 goto :fail

echo [tapython-tool-hub] starting API window...
start "tapython-tool-hub api" cmd /k "cd /d "%REPO_ROOT%" && set "API_HOST=%API_HOST%" && set "API_PORT=%API_PORT%" && npm run start -w @tapython-tool-hub/api 2>&1 | tee %LOG_DIR%\api.log"

echo [tapython-tool-hub] starting Web window...
start "tapython-tool-hub web" cmd /k "cd /d "%REPO_ROOT%" && npm run preview -w @tapython-tool-hub/web -- --host 0.0.0.0 --port %WEB_PORT% 2>&1 | tee %LOG_DIR%\web.log"

echo [tapython-tool-hub] started (dual mode).
echo [tapython-tool-hub] local web:  http://127.0.0.1:%WEB_PORT%/
echo [tapython-tool-hub] lan web:    http://%SERVER_HOST%:%WEB_PORT%/
echo [tapython-tool-hub] lan api:    http://%SERVER_HOST%:%API_PORT%/
echo [tapython-tool-hub] logs:       %LOG_DIR%\
goto :healthcheck

:single_mode
REM === Single-process mode ===
set "SERVE_STATIC=true"
set "API_HOST=0.0.0.0"

echo [tapython-tool-hub] building...
call npm run build
if errorlevel 1 goto :fail

call npm run build:api
if errorlevel 1 goto :fail

echo [tapython-tool-hub] starting API (single process, serving static) on %API_HOST%:%API_PORT%...
start "tapython-tool-hub" cmd /k "cd /d "%REPO_ROOT%" && set "SERVE_STATIC=true" && set "API_HOST=%API_HOST%" && set "API_PORT=%API_PORT%" && npm run start -w @tapython-tool-hub/api 2>&1 | tee %LOG_DIR%\api.log"

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
)
goto :eof

:fail
echo [tapython-tool-hub] startup failed with exit code %errorlevel%.
exit /b %errorlevel%
