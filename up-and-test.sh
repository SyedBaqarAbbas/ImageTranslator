#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BACKEND_SCRIPT="${BACKEND_DIR}/scripts/up-and-test.sh"
FRONTEND_SCRIPT="${FRONTEND_DIR}/scripts/up-and-test.sh"

CONDA_ENV_NAME="${CONDA_ENV_NAME:-imagetranslator}"
HEADLESS="${HEADLESS:-true}"

RUN_BACKEND="${RUN_BACKEND:-1}"
RUN_FRONTEND="${RUN_FRONTEND:-1}"
RUN_FULLSTACK_E2E="${RUN_FULLSTACK_E2E:-1}"
RUN_OPUS_MISSING_MODELS_E2E="${RUN_OPUS_MISSING_MODELS_E2E:-1}"
RUN_REAL_PROVIDER_E2E="${RUN_REAL_PROVIDER_E2E:-0}"

FULLSTACK_BACKEND_HOST="${FULLSTACK_BACKEND_HOST:-127.0.0.1}"
FULLSTACK_BACKEND_PORT="${FULLSTACK_BACKEND_PORT:-8010}"
FULLSTACK_BACKEND_ORIGIN="http://${FULLSTACK_BACKEND_HOST}:${FULLSTACK_BACKEND_PORT}"
FULLSTACK_FRONTEND_HOST="${FULLSTACK_FRONTEND_HOST:-127.0.0.1}"
FULLSTACK_FRONTEND_PORT="${FULLSTACK_FRONTEND_PORT:-5175}"
FULLSTACK_FRONTEND_ORIGIN="http://${FULLSTACK_FRONTEND_HOST}:${FULLSTACK_FRONTEND_PORT}"
FULLSTACK_DATABASE_URL="${FULLSTACK_DATABASE_URL:-sqlite+aiosqlite:////tmp/image-translator-fullstack-up-and-test-$$.db}"
FULLSTACK_STORAGE_PATH="${FULLSTACK_STORAGE_PATH:-/tmp/image-translator-fullstack-up-and-test-storage-$$}"
FULLSTACK_BACKEND_LOG_FILE="${FULLSTACK_BACKEND_LOG_FILE:-/tmp/image-translator-fullstack-backend-up-and-test-$$.log}"

OPUS_MISSING_BACKEND_HOST="${OPUS_MISSING_BACKEND_HOST:-127.0.0.1}"
OPUS_MISSING_BACKEND_PORT="${OPUS_MISSING_BACKEND_PORT:-8011}"
OPUS_MISSING_BACKEND_ORIGIN="http://${OPUS_MISSING_BACKEND_HOST}:${OPUS_MISSING_BACKEND_PORT}"
OPUS_MISSING_DATABASE_URL="${OPUS_MISSING_DATABASE_URL:-sqlite+aiosqlite:////tmp/image-translator-opus-missing-up-and-test-$$.db}"
OPUS_MISSING_STORAGE_PATH="${OPUS_MISSING_STORAGE_PATH:-/tmp/image-translator-opus-missing-up-and-test-storage-$$}"
OPUS_MISSING_MODEL_ROOT="${OPUS_MISSING_MODEL_ROOT:-/tmp/image-translator-opus-missing-models-$$}"
OPUS_MISSING_BACKEND_LOG_FILE="${OPUS_MISSING_BACKEND_LOG_FILE:-/tmp/image-translator-opus-missing-backend-up-and-test-$$.log}"

REAL_E2E_BACKEND_HOST="${REAL_E2E_BACKEND_HOST:-127.0.0.1}"
REAL_E2E_BACKEND_PORT="${REAL_E2E_BACKEND_PORT:-8020}"
REAL_E2E_BACKEND_ORIGIN="http://${REAL_E2E_BACKEND_HOST}:${REAL_E2E_BACKEND_PORT}"
REAL_E2E_FRONTEND_HOST="${REAL_E2E_FRONTEND_HOST:-127.0.0.1}"
REAL_E2E_FRONTEND_PORT="${REAL_E2E_FRONTEND_PORT:-5176}"
REAL_E2E_FRONTEND_ORIGIN="http://${REAL_E2E_FRONTEND_HOST}:${REAL_E2E_FRONTEND_PORT}"
REAL_E2E_DATABASE_URL="${REAL_E2E_DATABASE_URL:-sqlite+aiosqlite:////tmp/image-translator-real-provider-up-and-test-$$.db}"
REAL_E2E_STORAGE_PATH="${REAL_E2E_STORAGE_PATH:-/tmp/image-translator-real-provider-up-and-test-storage-$$}"
REAL_E2E_BACKEND_LOG_FILE="${REAL_E2E_BACKEND_LOG_FILE:-/tmp/image-translator-real-provider-backend-up-and-test-$$.log}"
REAL_E2E_TEST_IMAGE="${REAL_E2E_TEST_IMAGE:-}"
REAL_E2E_SOURCE_LANGUAGE="${REAL_E2E_SOURCE_LANGUAGE:-ko}"
OPUS_MT_MODEL_ROOT="${OPUS_MT_MODEL_ROOT:-${BACKEND_DIR}/models/opus-mt}"

PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-/tmp/image-translator-pycache}"

RESULTS=()
FAILED=0
CHILD_PIDS=()

log() {
  printf "\n==> %s\n" "$*"
}

record_skip() {
  RESULTS+=("SKIP $1")
}

run_step() {
  local name="$1"
  shift

  log "${name}"
  if "$@"; then
    RESULTS+=("PASS ${name}")
  else
    local status=$?
    RESULTS+=("FAIL ${name} (exit ${status})")
    FAILED=1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found on PATH." >&2
    return 1
  fi
}

load_conda() {
  if command -v conda >/dev/null 2>&1; then
    return 0
  fi

  if [ -f "${HOME}/anaconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/anaconda3/etc/profile.d/conda.sh"
  elif [ -f "${HOME}/miniconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/miniconda3/etc/profile.d/conda.sh"
  fi
}

cleanup_processes() {
  local pid
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup_processes EXIT INT TERM

wait_for_url() {
  local label="$1"
  local url="$2"
  local pid="$3"
  local log_file="$4"

  log "Waiting for ${label} at ${url}"
  for _ in $(seq 1 90); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      echo "${label} exited before becoming reachable." >&2
      echo "Last log lines from ${log_file}:" >&2
      tail -n 100 "${log_file}" >&2 || true
      wait "${pid}" >/dev/null 2>&1 || true
      return 1
    fi
    sleep 1
  done

  echo "${label} did not become reachable at ${url}." >&2
  echo "Last log lines from ${log_file}:" >&2
  tail -n 100 "${log_file}" >&2 || true
  return 1
}

stop_pid() {
  local pid="$1"
  if [ -n "${pid}" ] && kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    wait "${pid}" >/dev/null 2>&1 || true
  fi
}

start_mock_backend() {
  local origin="$1"
  local host="$2"
  local port="$3"
  local database_url="$4"
  local storage_path="$5"
  local log_file="$6"

  if curl -fsS "${origin}/api/v1/health" >/dev/null 2>&1; then
    echo "Port ${port} is already serving a backend app." >&2
    return 1
  fi

  mkdir -p "${storage_path}" "$(dirname "${log_file}")" "${PYTHONPYCACHEPREFIX}"
  : > "${log_file}"
  (
    cd "${BACKEND_DIR}"
    AUTO_CREATE_TABLES=true \
    DATABASE_URL="${database_url}" \
    LOCAL_STORAGE_PATH="${storage_path}" \
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
    PUBLIC_BASE_URL="${origin}" \
    OCR_PROVIDER=mock \
    TRANSLATION_PROVIDER=mock \
    CELERY_TASK_ALWAYS_EAGER=true \
    conda run -n "${CONDA_ENV_NAME}" python -m uvicorn app.main:app --host "${host}" --port "${port}"
  ) >"${log_file}" 2>&1 &
  STARTED_PID=$!
  CHILD_PIDS+=("${STARTED_PID}")
}

start_frontend_http() {
  local origin="$1"
  local host="$2"
  local port="$3"
  local api_base_url="$4"

  if curl -fsS "${origin}/" >/dev/null 2>&1; then
    echo "Port ${port} is already serving a frontend app." >&2
    return 1
  fi

  (
    cd "${FRONTEND_DIR}"
    VITE_API_MODE=http \
    VITE_API_BASE_URL="${api_base_url}" \
    npm run dev -- --host "${host}" --port "${port}"
  ) &
  STARTED_PID=$!
  CHILD_PIDS+=("${STARTED_PID}")
}

run_fullstack_http_e2e() {
  local status=0
  local backend_pid=""
  local frontend_pid=""

  load_conda || return 1
  require_command conda || return 1
  require_command npm || return 1
  require_command curl || return 1

  start_mock_backend \
    "${FULLSTACK_BACKEND_ORIGIN}" \
    "${FULLSTACK_BACKEND_HOST}" \
    "${FULLSTACK_BACKEND_PORT}" \
    "${FULLSTACK_DATABASE_URL}" \
    "${FULLSTACK_STORAGE_PATH}" \
    "${FULLSTACK_BACKEND_LOG_FILE}" || return 1
  backend_pid="${STARTED_PID}"
  wait_for_url "full-stack backend" "${FULLSTACK_BACKEND_ORIGIN}/api/v1/health" "${backend_pid}" "${FULLSTACK_BACKEND_LOG_FILE}" || status=1

  if [ "${status}" -eq 0 ]; then
    if start_frontend_http \
      "${FULLSTACK_FRONTEND_ORIGIN}" \
      "${FULLSTACK_FRONTEND_HOST}" \
      "${FULLSTACK_FRONTEND_PORT}" \
      "${FULLSTACK_BACKEND_ORIGIN}/api/v1"; then
      frontend_pid="${STARTED_PID}"
    else
      status=1
    fi
  fi

  if [ "${status}" -eq 0 ]; then
    wait_for_url "full-stack frontend" "${FULLSTACK_FRONTEND_ORIGIN}/" "${frontend_pid}" "${FULLSTACK_BACKEND_LOG_FILE}" || status=1
  fi

  if [ "${status}" -eq 0 ]; then
    (
      cd "${BACKEND_DIR}"
      PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
      conda run -n "${CONDA_ENV_NAME}" python tests/manual/e2e_local_pipeline_api.py "${FULLSTACK_BACKEND_ORIGIN}" ja "[en]"
    ) || status=1

    (
      cd "${FRONTEND_DIR}"
      TARGET_URL="${FULLSTACK_FRONTEND_ORIGIN}" \
      API_URL="${FULLSTACK_BACKEND_ORIGIN}/api/v1" \
      HEADLESS="${HEADLESS}" \
      node tests/manual/basic-functionality-playwright.cjs
    ) || status=1

    (
      cd "${FRONTEND_DIR}"
      TARGET_URL="${FULLSTACK_FRONTEND_ORIGIN}" \
      API_URL="${FULLSTACK_BACKEND_ORIGIN}/api/v1" \
      HEADLESS="${HEADLESS}" \
      node tests/manual/navbar-fix-playwright.cjs
    ) || status=1
  fi

  stop_pid "${frontend_pid}"
  stop_pid "${backend_pid}"
  return "${status}"
}

run_opus_missing_models_e2e() {
  local status=0
  local backend_pid=""

  load_conda || return 1
  require_command conda || return 1
  require_command curl || return 1

  if curl -fsS "${OPUS_MISSING_BACKEND_ORIGIN}/api/v1/health" >/dev/null 2>&1; then
    echo "Port ${OPUS_MISSING_BACKEND_PORT} is already serving a backend app." >&2
    return 1
  fi

  mkdir -p "${OPUS_MISSING_STORAGE_PATH}" "$(dirname "${OPUS_MISSING_BACKEND_LOG_FILE}")" "${PYTHONPYCACHEPREFIX}"
  : > "${OPUS_MISSING_BACKEND_LOG_FILE}"
  (
    cd "${BACKEND_DIR}"
    AUTO_CREATE_TABLES=true \
    DATABASE_URL="${OPUS_MISSING_DATABASE_URL}" \
    LOCAL_STORAGE_PATH="${OPUS_MISSING_STORAGE_PATH}" \
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
    PUBLIC_BASE_URL="${OPUS_MISSING_BACKEND_ORIGIN}" \
    OCR_PROVIDER=mock \
    TRANSLATION_PROVIDER=opus_mt \
    OPUS_MT_MODEL_ROOT="${OPUS_MISSING_MODEL_ROOT}" \
    CELERY_TASK_ALWAYS_EAGER=true \
    conda run -n "${CONDA_ENV_NAME}" python -m uvicorn app.main:app --host "${OPUS_MISSING_BACKEND_HOST}" --port "${OPUS_MISSING_BACKEND_PORT}"
  ) >"${OPUS_MISSING_BACKEND_LOG_FILE}" 2>&1 &
  backend_pid=$!
  CHILD_PIDS+=("${backend_pid}")

  wait_for_url "OPUS missing-model backend" "${OPUS_MISSING_BACKEND_ORIGIN}/api/v1/health" "${backend_pid}" "${OPUS_MISSING_BACKEND_LOG_FILE}" || status=1
  if [ "${status}" -eq 0 ]; then
    (
      cd "${BACKEND_DIR}"
      PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
      conda run -n "${CONDA_ENV_NAME}" python tests/manual/e2e_opus_missing_models.py "${OPUS_MISSING_BACKEND_ORIGIN}"
    ) || status=1
  fi

  stop_pid "${backend_pid}"
  return "${status}"
}

run_real_provider_ui_e2e() {
  local status=0
  local backend_pid=""
  local frontend_pid=""

  load_conda || return 1
  require_command conda || return 1
  require_command npm || return 1
  require_command curl || return 1
  require_command tesseract || return 1

  if [ -z "${REAL_E2E_TEST_IMAGE}" ]; then
    echo "REAL_E2E_TEST_IMAGE must point to a local image when RUN_REAL_PROVIDER_E2E=1." >&2
    return 1
  fi

  if [ ! -f "${REAL_E2E_TEST_IMAGE}" ]; then
    echo "Real-provider E2E image is missing: ${REAL_E2E_TEST_IMAGE}" >&2
    return 1
  fi

  (
    cd "${BACKEND_DIR}"
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
    conda run -n "${CONDA_ENV_NAME}" python scripts/prepare_opus_mt_models.py --model-root "${OPUS_MT_MODEL_ROOT}" --check-only
  ) || return 1

  if curl -fsS "${REAL_E2E_BACKEND_ORIGIN}/api/v1/health" >/dev/null 2>&1; then
    echo "Port ${REAL_E2E_BACKEND_PORT} is already serving a backend app." >&2
    return 1
  fi

  mkdir -p "${REAL_E2E_STORAGE_PATH}" "$(dirname "${REAL_E2E_BACKEND_LOG_FILE}")" "${PYTHONPYCACHEPREFIX}"
  : > "${REAL_E2E_BACKEND_LOG_FILE}"
  (
    cd "${BACKEND_DIR}"
    AUTO_CREATE_TABLES=true \
    DATABASE_URL="${REAL_E2E_DATABASE_URL}" \
    LOCAL_STORAGE_PATH="${REAL_E2E_STORAGE_PATH}" \
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX}" \
    PUBLIC_BASE_URL="${REAL_E2E_BACKEND_ORIGIN}" \
    OCR_PROVIDER=tesseract \
    TRANSLATION_PROVIDER=opus_mt \
    TESSERACT_DEFAULT_LANGUAGE="${REAL_E2E_SOURCE_LANGUAGE}" \
    TESSERACT_PSM=6 \
    TESSERACT_OEM=1 \
    OPUS_MT_MODEL_ROOT="${OPUS_MT_MODEL_ROOT}" \
    CELERY_TASK_ALWAYS_EAGER=true \
    conda run -n "${CONDA_ENV_NAME}" python -m uvicorn app.main:app --host "${REAL_E2E_BACKEND_HOST}" --port "${REAL_E2E_BACKEND_PORT}"
  ) >"${REAL_E2E_BACKEND_LOG_FILE}" 2>&1 &
  backend_pid=$!
  CHILD_PIDS+=("${backend_pid}")

  wait_for_url "real-provider backend" "${REAL_E2E_BACKEND_ORIGIN}/api/v1/health" "${backend_pid}" "${REAL_E2E_BACKEND_LOG_FILE}" || status=1

  if [ "${status}" -eq 0 ]; then
    if start_frontend_http \
      "${REAL_E2E_FRONTEND_ORIGIN}" \
      "${REAL_E2E_FRONTEND_HOST}" \
      "${REAL_E2E_FRONTEND_PORT}" \
      "${REAL_E2E_BACKEND_ORIGIN}/api/v1"; then
      frontend_pid="${STARTED_PID}"
    else
      status=1
    fi
  fi

  if [ "${status}" -eq 0 ]; then
    wait_for_url "real-provider frontend" "${REAL_E2E_FRONTEND_ORIGIN}/" "${frontend_pid}" "${REAL_E2E_BACKEND_LOG_FILE}" || status=1
  fi

  if [ "${status}" -eq 0 ]; then
    (
      cd "${ROOT_DIR}"
      TARGET_URL="${REAL_E2E_FRONTEND_ORIGIN}" \
      API_BASE="${REAL_E2E_BACKEND_ORIGIN}/api/v1" \
      TEST_IMAGE="${REAL_E2E_TEST_IMAGE}" \
      SOURCE_LANGUAGE="${REAL_E2E_SOURCE_LANGUAGE}" \
      HEADLESS="${HEADLESS}" \
      NODE_PATH="${FRONTEND_DIR}/node_modules" \
      node e2e/ui-e2e-opus-mt.js
    ) || status=1
  fi

  stop_pid "${frontend_pid}"
  stop_pid "${backend_pid}"
  return "${status}"
}

if [ "${RUN_BACKEND}" = "1" ]; then
  if [ ! -x "${BACKEND_SCRIPT}" ]; then
    echo "Backend script is missing or not executable: ${BACKEND_SCRIPT}" >&2
    exit 1
  fi
  run_step "Backend up and test" "${BACKEND_SCRIPT}"
else
  record_skip "Backend up and test"
fi

if [ "${RUN_FRONTEND}" = "1" ]; then
  if [ ! -x "${FRONTEND_SCRIPT}" ]; then
    echo "Frontend script is missing or not executable: ${FRONTEND_SCRIPT}" >&2
    exit 1
  fi
  run_step "Frontend up and test" "${FRONTEND_SCRIPT}"
else
  record_skip "Frontend up and test"
fi

if [ "${RUN_FULLSTACK_E2E}" = "1" ]; then
  run_step "Full-stack HTTP E2E tests" run_fullstack_http_e2e
else
  record_skip "Full-stack HTTP E2E tests"
fi

if [ "${RUN_OPUS_MISSING_MODELS_E2E}" = "1" ]; then
  run_step "OPUS-MT missing-model E2E test" run_opus_missing_models_e2e
else
  record_skip "OPUS-MT missing-model E2E test"
fi

if [ "${RUN_REAL_PROVIDER_E2E}" = "1" ]; then
  run_step "Real-provider UI E2E test" run_real_provider_ui_e2e
else
  record_skip "Real-provider UI E2E test"
fi

log "Summary"
for result in "${RESULTS[@]}"; do
  printf " - %s\n" "${result}"
done

if [ "${FAILED}" -eq 0 ]; then
  printf "\nAll checks passed.\n"
else
  printf "\nOne or more checks failed.\n" >&2
fi

exit "${FAILED}"
