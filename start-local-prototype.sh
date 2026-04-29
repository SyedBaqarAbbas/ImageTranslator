#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

CONDA_ENV_NAME="${CONDA_ENV_NAME:-imagetranslator}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_ORIGIN="http://${BACKEND_HOST}:${BACKEND_PORT}"
FRONTEND_ORIGIN="http://${FRONTEND_HOST}:${FRONTEND_PORT}"

AUTO_CREATE_TABLES="${AUTO_CREATE_TABLES:-true}"
DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:////tmp/image-translator-local-prototype.db}"
LOCAL_STORAGE_PATH="${LOCAL_STORAGE_PATH:-/tmp/image-translator-local-prototype-storage}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-${BACKEND_ORIGIN}}"
OCR_PROVIDER="${OCR_PROVIDER:-tesseract}"
TRANSLATION_PROVIDER="${TRANSLATION_PROVIDER:-opus_mt}"
TESSERACT_DEFAULT_LANGUAGE="${TESSERACT_DEFAULT_LANGUAGE:-kor}"
TESSERACT_PSM="${TESSERACT_PSM:-6}"
TESSERACT_OEM="${TESSERACT_OEM:-1}"
OPUS_MT_MODEL_ROOT="${OPUS_MT_MODEL_ROOT:-${BACKEND_DIR}/models/opus-mt}"
VITE_API_MODE="${VITE_API_MODE:-http}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-${BACKEND_ORIGIN}/api/v1}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping local prototype..."
  if [ -n "${FRONTEND_PID}" ]; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${BACKEND_PID}" ]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  wait "${FRONTEND_PID}" >/dev/null 2>&1 || true
  wait "${BACKEND_PID}" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

if ! command -v conda >/dev/null 2>&1; then
  if [ -f "${HOME}/anaconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/anaconda3/etc/profile.d/conda.sh"
  elif [ -f "${HOME}/miniconda3/etc/profile.d/conda.sh" ]; then
    # shellcheck source=/dev/null
    source "${HOME}/miniconda3/etc/profile.d/conda.sh"
  fi
fi

if ! command -v conda >/dev/null 2>&1; then
  echo "conda was not found. Install conda or create the ${CONDA_ENV_NAME} env first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js dependencies before starting the frontend." >&2
  exit 1
fi

if [ "${OCR_PROVIDER}" = "tesseract" ] && ! command -v tesseract >/dev/null 2>&1; then
  echo "tesseract was not found. On macOS run: brew install tesseract tesseract-lang" >&2
  exit 1
fi

if [ "${TRANSLATION_PROVIDER}" = "opus_mt" ]; then
  echo "Checking OPUS-MT model folders..."
  (
    cd "${BACKEND_DIR}"
    conda run -n "${CONDA_ENV_NAME}" python scripts/prepare_opus_mt_models.py \
      --model-root "${OPUS_MT_MODEL_ROOT}" \
      --check-only
  )
fi

if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
  echo "frontend/node_modules is missing. Run npm install in frontend/ first." >&2
  exit 1
fi

echo "Starting ImageTranslator local prototype"
echo "Backend:  ${BACKEND_ORIGIN}"
echo "Frontend: ${FRONTEND_ORIGIN}"
echo "OCR:      ${OCR_PROVIDER}"
echo "MT:       ${TRANSLATION_PROVIDER}"
echo

(
  cd "${BACKEND_DIR}"
  AUTO_CREATE_TABLES="${AUTO_CREATE_TABLES}" \
  DATABASE_URL="${DATABASE_URL}" \
  LOCAL_STORAGE_PATH="${LOCAL_STORAGE_PATH}" \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL}" \
  OCR_PROVIDER="${OCR_PROVIDER}" \
  TRANSLATION_PROVIDER="${TRANSLATION_PROVIDER}" \
  TESSERACT_DEFAULT_LANGUAGE="${TESSERACT_DEFAULT_LANGUAGE}" \
  TESSERACT_PSM="${TESSERACT_PSM}" \
  TESSERACT_OEM="${TESSERACT_OEM}" \
  OPUS_MT_MODEL_ROOT="${OPUS_MT_MODEL_ROOT}" \
  conda run -n "${CONDA_ENV_NAME}" python -m uvicorn app.main:app \
    --host "${BACKEND_HOST}" \
    --port "${BACKEND_PORT}"
) &
BACKEND_PID=$!

echo "Waiting for backend health..."
for _ in $(seq 1 60); do
  if curl -fsS "${BACKEND_ORIGIN}/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    echo "Backend exited before becoming healthy." >&2
    wait "${BACKEND_PID}"
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "${BACKEND_ORIGIN}/api/v1/health" >/dev/null 2>&1; then
  echo "Backend did not become healthy at ${BACKEND_ORIGIN}/api/v1/health." >&2
  exit 1
fi

(
  cd "${FRONTEND_DIR}"
  VITE_API_MODE="${VITE_API_MODE}" \
  VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
  npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

echo "Waiting for frontend..."
for _ in $(seq 1 60); do
  if curl -fsSI "${FRONTEND_ORIGIN}/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
    echo "Frontend exited before becoming reachable." >&2
    wait "${FRONTEND_PID}"
    exit 1
  fi
  sleep 1
done

if ! curl -fsSI "${FRONTEND_ORIGIN}/" >/dev/null 2>&1; then
  echo "Frontend did not become reachable at ${FRONTEND_ORIGIN}." >&2
  exit 1
fi

echo
echo "Local prototype is up:"
echo "  Frontend: ${FRONTEND_ORIGIN}"
echo "  Backend:  ${BACKEND_ORIGIN}/api/v1/health"
echo
echo "Press Ctrl-C to stop both servers."

while true; do
  if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    echo "Backend process stopped." >&2
    wait "${BACKEND_PID}" || true
    exit 1
  fi
  if ! kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
    echo "Frontend process stopped." >&2
    wait "${FRONTEND_PID}" || true
    exit 1
  fi
  sleep 2
done
