#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SERVER_HOST="${1:-127.0.0.1}"
WEB_PORT="${2:-4174}"
API_PORT="${3:-8787}"

export VITE_API_BASE_URL="http://${SERVER_HOST}:${API_PORT}"
export API_HOST="0.0.0.0"
export API_PORT

echo "[tapython-tool-hub] repo root:   ${REPO_ROOT}"
echo "[tapython-tool-hub] api:         http://${SERVER_HOST}:${API_PORT}"
echo "[tapython-tool-hub] web:         http://${SERVER_HOST}:${WEB_PORT}"
echo ""

echo "[tapython-tool-hub] building..."
npm run build
npm run build:api

echo ""
echo "[tapython-tool-hub] starting API on ${API_HOST}:${API_PORT}..."
npm run start -w @tapython-tool-hub/api &
API_PID=$!

echo "[tapython-tool-hub] starting Web preview on 0.0.0.0:${WEB_PORT}..."
npm run preview -w @tapython-tool-hub/web -- --host 0.0.0.0 --port "$WEB_PORT" &
WEB_PID=$!

echo ""
echo "[tapython-tool-hub] ready."
echo "  local web:  http://127.0.0.1:${WEB_PORT}/"
echo "  lan web:    http://${SERVER_HOST}:${WEB_PORT}/"
echo "  lan api:    http://${SERVER_HOST}:${API_PORT}/"
echo ""
echo "  API PID=${API_PID}  Web PID=${WEB_PID}"
echo "  Press Ctrl+C to stop both."

cleanup() {
  echo ""
  echo "[tapython-tool-hub] shutting down..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait
}
trap cleanup EXIT INT TERM

wait
