#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONDA_ENV_NAME="${CONDA_ENV_NAME:-imagetranslator}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_ORIGIN="http://${BACKEND_HOST}:${BACKEND_PORT}"
API_V1_PREFIX="${API_V1_PREFIX:-/api/v1}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-${BACKEND_ORIGIN}${API_V1_PREFIX}/health}"
BACKEND_DATABASE_URL="${BACKEND_DATABASE_URL:-sqlite+aiosqlite:////tmp/image-translator-up-and-test.db}"
BACKEND_STORAGE_PATH="${BACKEND_STORAGE_PATH:-/tmp/image-translator-up-and-test-storage}"
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-/tmp/image-translator-backend-up-and-test.log}"
PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-/tmp/image-translator-pycache}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-${BACKEND_ORIGIN}}"
RUN_BACKEND_TESTS="${RUN_BACKEND_TESTS:-1}"
RUN_BACKEND_COMPILE="${RUN_BACKEND_COMPILE:-1}"
KEEP_APP_UP="${KEEP_APP_UP:-0}"

BACKEND_PID=""

log() {
  printf "\n==> %s\n" "$*"
}

cleanup() {
  if [ -n "${BACKEND_PID}" ] && [ "${KEEP_APP_UP}" != "1" ]; then
    log "Stopping backend app"
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    wait "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found on PATH." >&2
    exit 1
  fi
}

load_conda() {
  if command -v conda >/dev/null 2>&1; then
    return
  fi

  if [ -f "${HOME}/anaconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/anaconda3/etc/profile.d/conda.sh"
  elif [ -f "${HOME}/miniconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/miniconda3/etc/profile.d/conda.sh"
  fi
}

wait_for_backend() {
  log "Waiting for backend at ${BACKEND_HEALTH_URL}"
  for _ in $(seq 1 60); do
    if curl -fsS "${BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
      return
    fi
    if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
      echo "Backend exited before becoming reachable." >&2
      echo "Last backend log lines from ${BACKEND_LOG_FILE}:" >&2
      tail -n 80 "${BACKEND_LOG_FILE}" >&2 || true
      wait "${BACKEND_PID}"
      exit 1
    fi
    sleep 1
  done

  echo "Backend did not become reachable at ${BACKEND_HEALTH_URL}." >&2
  echo "Last backend log lines from ${BACKEND_LOG_FILE}:" >&2
  tail -n 80 "${BACKEND_LOG_FILE}" >&2 || true
  exit 1
}

run_backend_tests() {
  if [ "${RUN_BACKEND_TESTS}" != "1" ]; then
    log "Skipping backend tests"
    return
  fi

  log "Running backend pytest"
  (
    cd "${BACKEND_DIR}"
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" conda run -n "${CONDA_ENV_NAME}" pytest -q
  )
}

run_backend_compile() {
  if [ "${RUN_BACKEND_COMPILE}" != "1" ]; then
    log "Skipping backend compile"
    return
  fi

  log "Compiling backend Python files"
  (
    cd "${BACKEND_DIR}"
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" conda run -n "${CONDA_ENV_NAME}" python -m compileall app migrations
  )
}

require_command curl
load_conda
require_command conda

if curl -fsS "${BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
  echo "Port ${BACKEND_PORT} is already serving a backend app." >&2
  echo "Stop it or rerun with BACKEND_PORT=<free-port> so this script controls the test app." >&2
  exit 1
fi

mkdir -p "${BACKEND_STORAGE_PATH}"
mkdir -p "${PYTHONPYCACHEPREFIX}"
: > "${BACKEND_LOG_FILE}"

log "Starting backend app at ${BACKEND_ORIGIN}"
(
  cd "${BACKEND_DIR}"
  AUTO_CREATE_TABLES=true \
  DATABASE_URL="${BACKEND_DATABASE_URL}" \
  LOCAL_STORAGE_PATH="${BACKEND_STORAGE_PATH}" \
  PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL}" \
  CELERY_TASK_ALWAYS_EAGER=true \
  conda run -n "${CONDA_ENV_NAME}" python -m uvicorn app.main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
) >"${BACKEND_LOG_FILE}" 2>&1 &
BACKEND_PID=$!

wait_for_backend
run_backend_tests
run_backend_compile

log "Backend checks passed"
