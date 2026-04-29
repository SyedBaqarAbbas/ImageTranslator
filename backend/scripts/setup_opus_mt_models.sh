#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONDA_ENV_NAME="${CONDA_ENV_NAME:-imagetranslator}"
MODEL_ROOT="${OPUS_MT_MODEL_ROOT:-${BACKEND_DIR}/models/opus-mt}"
QUANTIZATION="${OPUS_MT_QUANTIZATION:-int8}"
SKIP_DEP_INSTALL="${OPUS_MT_SKIP_DEP_INSTALL:-0}"
FORCE="${OPUS_MT_FORCE:-0}"

PAIRS=("$@")
if [ "${#PAIRS[@]}" -eq 0 ]; then
  PAIRS=("ko-en" "ja-en")
fi

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
  echo "conda was not found. Install conda or set up the ${CONDA_ENV_NAME} environment first." >&2
  exit 1
fi

echo "Using conda env: ${CONDA_ENV_NAME}"
echo "Model root: ${MODEL_ROOT}"
echo "Language pairs: ${PAIRS[*]}"

if [ "${SKIP_DEP_INSTALL}" != "1" ]; then
  if conda run -n "${CONDA_ENV_NAME}" python -c "import transformers, sacremoses, accelerate" >/dev/null 2>&1; then
    echo "Conversion-only dependencies are already installed."
  else
    echo "Installing conversion-only dependencies into ${CONDA_ENV_NAME}..."
    conda run -n "${CONDA_ENV_NAME}" python -m pip install \
      "transformers>=4.44,<5" \
      "sacremoses>=0.1.1" \
      "accelerate>=0.26"
  fi
fi

PREPARE_CMD=(
  conda run -n "${CONDA_ENV_NAME}" python "${SCRIPT_DIR}/prepare_opus_mt_models.py"
  --model-root "${MODEL_ROOT}"
  --pairs "${PAIRS[@]}"
  --quantization "${QUANTIZATION}"
)
if [ "${FORCE}" = "1" ]; then
  PREPARE_CMD+=("--force")
fi
"${PREPARE_CMD[@]}"

conda run -n "${CONDA_ENV_NAME}" python "${SCRIPT_DIR}/prepare_opus_mt_models.py" \
  --model-root "${MODEL_ROOT}" \
  --pairs "${PAIRS[@]}" \
  --check-only

echo "OPUS-MT models are ready under ${MODEL_ROOT}."
