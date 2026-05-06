@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

set "SERVER_HOST=%~1"
if "%SERVER_HOST%"=="" set "SERVER_HOST=127.0.0.1"

set "WEB_PORT=%~2"
if "%WEB_PORT%"=="" set "WEB_PORT=5174"

set "API_PORT=%~3"
if "%API_PORT%"=="" set "API_PORT=8787"

set "VITE_API_BASE_URL=http://%SERVER_HOST%:%API_PORT%"
set "API_HOST=0.0.0.0"

echo [tapython-tool-hub] repo root: %REPO_ROOT%
echo [tapython-tool-hub] building web with VITE_API_BASE_URL=%VITE_API_BASE_URL%
echo [tapython-tool-hub] api will listen on %API_HOST%:%API_PORT%
echo [tapython-tool-hub] web preview will listen on 0.0.0.0:%WEB_PORT%

call npm run build
if errorlevel 1 goto :fail

call npm run build:api
if errorlevel 1 goto :fail

echo [tapython-tool-hub] starting API window...
start "tapython-tool-hub api" cmd /k "cd /d "%REPO_ROOT%" && set "API_HOST=%API_HOST%" && set "API_PORT=%API_PORT%" && npm run start -w @tapython-tool-hub/api"

echo [tapython-tool-hub] starting Web window...
start "tapython-tool-hub web" cmd /k "cd /d "%REPO_ROOT%" && npm run preview -w @tapython-tool-hub/web -- --host 0.0.0.0 --port %WEB_PORT%"

echo [tapython-tool-hub] started.
echo [tapython-tool-hub] local web:  http://127.0.0.1:%WEB_PORT%/
echo [tapython-tool-hub] lan web:    http://%SERVER_HOST%:%WEB_PORT%/
echo [tapython-tool-hub] lan api:    http://%SERVER_HOST%:%API_PORT%/
goto :eof

:fail
echo [tapython-tool-hub] startup failed with exit code %errorlevel%.
exit /b %errorlevel%