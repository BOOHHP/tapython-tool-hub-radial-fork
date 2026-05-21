@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

set "REMOTE_NAME=%~1"
if "%REMOTE_NAME%"=="" set "REMOTE_NAME=radial-fork"

set "REMOTE_BRANCH=%~2"
if "%REMOTE_BRANCH%"=="" set "REMOTE_BRANCH=master"

set "SERVER_HOST=%~3"
if "%SERVER_HOST%"=="" set "SERVER_HOST=10.2.13.8"

set "WEB_PORT=%~4"
if "%WEB_PORT%"=="" set "WEB_PORT=5174"

set "API_PORT=%~5"
if "%API_PORT%"=="" set "API_PORT=8787"

set "MODE=%~6"
if "%MODE%"=="" set "MODE=dual"

set "ENV_FILE=%REPO_ROOT%\.env"

echo [tapython-tool-hub deploy] repo root: %REPO_ROOT%
echo [tapython-tool-hub deploy] target:    %REMOTE_NAME%/%REMOTE_BRANCH%
echo [tapython-tool-hub deploy] host:      %SERVER_HOST%
echo [tapython-tool-hub deploy] mode:      %MODE%

if "%REPO_ROOT:~0,2%"=="\\" (
    echo [tapython-tool-hub deploy] UNC path detected, mapping to drive letter via pushd...
    pushd "%REPO_ROOT%"
    if errorlevel 1 (
        echo [tapython-tool-hub deploy] ERROR: failed to map UNC path to drive letter.
        exit /b 1
    )
    for %%I in (".") do set "REPO_ROOT=%%~fI"
    set "SCRIPT_DIR=!REPO_ROOT!\scripts\"
    set "ENV_FILE=!REPO_ROOT!\.env"
    echo [tapython-tool-hub deploy] mapped to: !REPO_ROOT!
)

where git >nul 2>&1
if errorlevel 1 goto :missing_git

where npm >nul 2>&1
if errorlevel 1 goto :missing_npm

git remote get-url "%REMOTE_NAME%" >nul 2>&1
if errorlevel 1 goto :missing_remote

if not exist "%ENV_FILE%" goto :missing_env
call :read_env
if not defined ADMIN_USERNAME_VALUE goto :missing_admin_config
if not defined ADMIN_PASSWORD_HASH_VALUE goto :missing_admin_config
if not defined AUTH_SESSION_SECRET_VALUE goto :missing_admin_config

echo [tapython-tool-hub deploy] admin auth config found.
echo [tapython-tool-hub deploy] fetching remote...
git fetch "%REMOTE_NAME%" --prune
if errorlevel 1 goto :fail

echo [tapython-tool-hub deploy] resetting tracked files to %REMOTE_NAME%/%REMOTE_BRANCH%...
git reset --hard "%REMOTE_NAME%/%REMOTE_BRANCH%"
if errorlevel 1 goto :fail

echo [tapython-tool-hub deploy] cleaning untracked files while preserving runtime data...
git clean -fd -e .env -e logs/ -e .tapython-tool-hub/
if errorlevel 1 goto :fail

echo [tapython-tool-hub deploy] installing dependencies with npm ci...
call npm ci
if errorlevel 1 goto :fail

echo [tapython-tool-hub deploy] starting production service...
call "%SCRIPT_DIR%start-production.bat" "%SERVER_HOST%" "%WEB_PORT%" "%API_PORT%" "%MODE%"
if errorlevel 1 goto :fail

echo [tapython-tool-hub deploy] done.
goto :eof

:read_env
set "ADMIN_USERNAME_VALUE="
set "ADMIN_PASSWORD_HASH_VALUE="
set "AUTH_SESSION_SECRET_VALUE="
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if /i "%%A"=="ADMIN_USERNAME" set "ADMIN_USERNAME_VALUE=%%B"
    if /i "%%A"=="ADMIN_PASSWORD_HASH" set "ADMIN_PASSWORD_HASH_VALUE=%%B"
    if /i "%%A"=="AUTH_SESSION_SECRET" set "AUTH_SESSION_SECRET_VALUE=%%B"
)
goto :eof

:fail
echo [tapython-tool-hub deploy] failed with exit code %errorlevel%.
exit /b %errorlevel%

:missing_git
echo [tapython-tool-hub deploy] ERROR: git is not available in PATH.
exit /b 1

:missing_npm
echo [tapython-tool-hub deploy] ERROR: npm is not available in PATH.
exit /b 1

:missing_remote
echo [tapython-tool-hub deploy] ERROR: git remote "%REMOTE_NAME%" does not exist.
echo [tapython-tool-hub deploy] Add it first or pass another remote name.
exit /b 1

:missing_env
echo [tapython-tool-hub deploy] ERROR: .env is required on the server and was not found.
echo [tapython-tool-hub deploy] Copy .env to %ENV_FILE% before deploying.
exit /b 1

:missing_admin_config
echo [tapython-tool-hub deploy] ERROR: .env must define ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and AUTH_SESSION_SECRET.
exit /b 1

:unc_not_supported
echo [tapython-tool-hub deploy] ERROR: failed to handle UNC workspace path.
exit /b 1