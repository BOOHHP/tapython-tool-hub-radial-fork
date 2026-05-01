#!/usr/bin/env bash
set -euo pipefail

# tapython-tool-hub CLI installer
# Usage: curl -fsSL https://<hub-domain>/install/cli.sh | bash -s -- --cli-only
#
# This script only installs the tapython-tool-hub CLI command.
# It does NOT modify any Unreal Engine project directories.

VERSION="${TTH_VERSION:-latest}"
INSTALL_DIR="${TTH_INSTALL_DIR:-$HOME/.tapython-tool-hub/bin}"
HUB_BASE="${TTH_HUB_BASE:-}"

print_banner() {
  echo ""
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║  TAPython Tool Hub CLI Installer     ║"
  echo "  ╚══════════════════════════════════════╝"
  echo ""
}

detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    linux)  OS="linux" ;;
    darwin) OS="darwin" ;;
    mingw*|msys*|cygwin*) OS="windows" ;;
    *) echo "Error: unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Error: unsupported architecture: $arch" >&2; exit 1 ;;
  esac
}

install_from_npm() {
  echo "Installing tapython-tool-hub CLI via npm..."
  echo ""

  if command -v npm &>/dev/null; then
    echo "  Found npm: $(npm --version)"
    echo "  Installing globally..."
    npm install -g @tapython-tool-hub/cli 2>/dev/null || {
      echo ""
      echo "  Global install failed (permissions?). Trying local install..."
      mkdir -p "$INSTALL_DIR"
      cd "$INSTALL_DIR"
      npm init -y &>/dev/null
      npm install @tapython-tool-hub/cli &>/dev/null
      INSTALLED_BIN="$INSTALL_DIR/node_modules/.bin/tapython-tool-hub"
      if [ -f "$INSTALLED_BIN" ]; then
        mkdir -p "$HOME/.tapython-tool-hub/bin"
        ln -sf "$INSTALLED_BIN" "$HOME/.tapython-tool-hub/bin/tapython-tool-hub"
      fi
    }
  else
    echo "  npm not found. Attempting standalone install..."
    install_standalone
    return
  fi
}

install_standalone() {
  mkdir -p "$INSTALL_DIR"

  if [ -z "$HUB_BASE" ]; then
    echo "Error: standalone install requires TTH_HUB_BASE environment variable." >&2
    echo "  Example: TTH_HUB_BASE=http://192.168.1.100:8787 bash install-cli.sh" >&2
    exit 1
  fi

  local archive_url="${HUB_BASE}/install/cli-${OS}-${ARCH}.tar.gz"
  echo "  Downloading from: $archive_url"

  if command -v curl &>/dev/null; then
    curl -fsSL "$archive_url" | tar -xz -C "$INSTALL_DIR"
  elif command -v wget &>/dev/null; then
    wget -qO- "$archive_url" | tar -xz -C "$INSTALL_DIR"
  else
    echo "Error: neither curl nor wget found." >&2
    exit 1
  fi
}

setup_path() {
  local shell_rc=""
  local path_line="export PATH=\"$INSTALL_DIR:\$PATH\""

  if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    shell_rc="$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "bash" ]; then
    shell_rc="$HOME/.bashrc"
  fi

  if [ -n "$shell_rc" ]; then
    if ! grep -q "tapython-tool-hub" "$shell_rc" 2>/dev/null; then
      echo "" >> "$shell_rc"
      echo "# TAPython Tool Hub CLI" >> "$shell_rc"
      echo "$path_line" >> "$shell_rc"
      echo "  Added to PATH in $shell_rc"
    else
      echo "  PATH already configured in $shell_rc"
    fi
  fi
}

verify_install() {
  echo ""
  if command -v tapython-tool-hub &>/dev/null; then
    echo "  ✓ tapython-tool-hub $(tapython-tool-hub --version 2>/dev/null || echo 'installed')"
  elif [ -x "$INSTALL_DIR/tapython-tool-hub" ]; then
    echo "  ✓ Installed to $INSTALL_DIR/tapython-tool-hub"
    echo "  ⚠ Restart your shell or run: export PATH=\"$INSTALL_DIR:\$PATH\""
  elif [ -x "$INSTALL_DIR/node_modules/.bin/tapython-tool-hub" ]; then
    echo "  ✓ Installed to $INSTALL_DIR/node_modules/.bin/tapython-tool-hub"
  else
    echo "  ✗ Installation may have failed. Check the output above."
    exit 1
  fi

  echo ""
  echo "  Next steps:"
  echo "    tapython-tool-hub --help"
  echo "    tapython-tool-hub search <query> --hub <hub-url>"
  echo "    tapython-tool-hub install <tool> --hub <hub-url> --project <path>"
  echo ""
}

main() {
  local cli_only=false

  for arg in "$@"; do
    case "$arg" in
      --cli-only) cli_only=true ;;
      --help|-h)
        echo "Usage: bash cli.sh [--cli-only]"
        echo ""
        echo "Options:"
        echo "  --cli-only   Only install the CLI, do not modify UE projects (default)"
        echo ""
        echo "Environment:"
        echo "  TTH_HUB_BASE    Hub base URL for standalone install"
        echo "  TTH_INSTALL_DIR  Installation directory (default: ~/.tapython-tool-hub/bin)"
        echo "  TTH_VERSION      Version to install (default: latest)"
        exit 0
        ;;
    esac
  done

  print_banner
  detect_platform
  echo "  Platform: $OS/$ARCH"
  echo "  Install dir: $INSTALL_DIR"
  echo ""

  install_from_npm
  setup_path
  verify_install
}

main "$@"
