#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SCRIPT="${ROOT_DIR}/backend/scripts/up-and-test.sh"
FRONTEND_SCRIPT="${ROOT_DIR}/frontend/scripts/up-and-test.sh"

RUN_BACKEND="${RUN_BACKEND:-1}"
RUN_FRONTEND="${RUN_FRONTEND:-1}"

RESULTS=()
FAILED=0

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
