#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"
FRONTEND_ORIGIN="http://${FRONTEND_HOST}:${FRONTEND_PORT}"
VITE_API_MODE="${VITE_API_MODE:-mock}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
RUN_FRONTEND_BUILD="${RUN_FRONTEND_BUILD:-1}"
RUN_BUTTON_AUDIT="${RUN_BUTTON_AUDIT:-0}"
KEEP_APP_UP="${KEEP_APP_UP:-0}"

FRONTEND_PID=""

log() {
  printf "\n==> %s\n" "$*"
}

cleanup() {
  if [ -n "${FRONTEND_PID}" ] && [ "${KEEP_APP_UP}" != "1" ]; then
    log "Stopping frontend app"
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
    wait "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found on PATH." >&2
    exit 1
  fi
}

wait_for_frontend() {
  log "Waiting for frontend at ${FRONTEND_ORIGIN}"
  for _ in $(seq 1 60); do
    if curl -fsSI "${FRONTEND_ORIGIN}/" >/dev/null 2>&1; then
      return
    fi
    if ! kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
      echo "Frontend exited before becoming reachable." >&2
      wait "${FRONTEND_PID}"
      exit 1
    fi
    sleep 1
  done

  echo "Frontend did not become reachable at ${FRONTEND_ORIGIN}." >&2
  exit 1
}

run_frontend_checks() {
  log "Running frontend typecheck"
  (cd "${FRONTEND_DIR}" && npm run typecheck)

  log "Running frontend lint"
  (cd "${FRONTEND_DIR}" && npm run lint)

  log "Running frontend unit tests"
  (cd "${FRONTEND_DIR}" && npm run test)

  if [ "${RUN_FRONTEND_BUILD}" = "1" ]; then
    log "Building frontend"
    (cd "${FRONTEND_DIR}" && npm run build)
  fi

  log "Running Playwright smoke tests"
  (
    cd "${FRONTEND_DIR}"
    PLAYWRIGHT_PORT="${FRONTEND_PORT}" \
    VITE_API_MODE="${VITE_API_MODE}" \
    VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
    npm run test:e2e
  )

  if [ "${RUN_BUTTON_AUDIT}" = "1" ]; then
    log "Running button audit"
    (
      cd "${FRONTEND_DIR}"
      TARGET_URL="${FRONTEND_ORIGIN}" npm run audit:buttons
    )
  fi
}

require_command curl
require_command npm

if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
  echo "frontend/node_modules is missing. Run npm install in frontend/ first." >&2
  exit 1
fi

if curl -fsSI "${FRONTEND_ORIGIN}/" >/dev/null 2>&1; then
  echo "Port ${FRONTEND_PORT} is already serving an app." >&2
  echo "Stop it or rerun with FRONTEND_PORT=<free-port> so this script controls the test app." >&2
  exit 1
fi

log "Starting frontend app in ${VITE_API_MODE} mode at ${FRONTEND_ORIGIN}"
(
  cd "${FRONTEND_DIR}"
  VITE_API_MODE="${VITE_API_MODE}" \
  VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
  npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

wait_for_frontend
run_frontend_checks

log "Frontend checks passed"
