# tapython-tool-hub CLI installer for Windows
# Usage: irm https://<hub-domain>/install/cli.ps1 | iex
#
# This script only installs the tapython-tool-hub CLI command.
# It does NOT modify any Unreal Engine project directories.

$ErrorActionPreference = "Stop"

$InstallDir = if ($env:TTH_INSTALL_DIR) { $env:TTH_INSTALL_DIR } else { "$env:USERPROFILE\.tapython-tool-hub\bin" }
$HubBase = $env:TTH_HUB_BASE

Write-Host ""
Write-Host "  TAPython Tool Hub CLI Installer (Windows)" -ForegroundColor Cyan
Write-Host ""

function Install-ViaNpm {
    $npmPath = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmPath) {
        Write-Host "  Found npm: $(npm --version)"
        Write-Host "  Installing globally..."
        try {
            npm install -g @tapython-tool-hub/cli 2>$null
            return $true
        } catch {
            Write-Host "  Global install failed. Trying local install..." -ForegroundColor Yellow
            New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
            Push-Location $InstallDir
            npm init -y 2>$null | Out-Null
            npm install @tapython-tool-hub/cli 2>$null
            Pop-Location
            return $true
        }
    }
    return $false
}

function Install-Standalone {
    if (-not $HubBase) {
        Write-Host "  Error: standalone install requires TTH_HUB_BASE environment variable." -ForegroundColor Red
        Write-Host "  Example: `$env:TTH_HUB_BASE='http://192.168.1.100:8787'; irm .../cli.ps1 | iex"
        exit 1
    }

    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $url = "$HubBase/install/cli-windows-$arch.zip"

    Write-Host "  Downloading from: $url"
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $zipPath = "$env:TEMP\tapython-tool-hub-cli.zip"
    Invoke-WebRequest -Uri $url -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
    Remove-Item $zipPath
}

function Set-PathEntry {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$currentPath", "User")
        Write-Host "  Added $InstallDir to user PATH"
        $env:Path = "$InstallDir;$env:Path"
    } else {
        Write-Host "  PATH already configured"
    }
}

# Main
Write-Host "  Install dir: $InstallDir"
Write-Host ""

$npmInstalled = Install-ViaNpm
if (-not $npmInstalled) {
    Install-Standalone
}

Set-PathEntry

Write-Host ""
$tthCmd = Get-Command tapython-tool-hub -ErrorAction SilentlyContinue
if ($tthCmd) {
    Write-Host "  ✓ tapython-tool-hub installed" -ForegroundColor Green
} else {
    $localBin = Join-Path $InstallDir "node_modules\.bin\tapython-tool-hub.cmd"
    if (Test-Path $localBin) {
        Write-Host "  ✓ Installed to $localBin" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Installation may have failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "  Next steps:"
Write-Host "    tapython-tool-hub --help"
Write-Host "    tapython-tool-hub search <query> --hub <hub-url>"
Write-Host "    tapython-tool-hub install <tool> --hub <hub-url> --project <path>"
Write-Host ""
