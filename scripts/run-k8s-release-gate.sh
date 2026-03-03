#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${ARTIFACT_DIR}/k8s-release-gate-summary.json"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"

mkdir -p "${ARTIFACT_DIR}"

PORT_FORWARD_PID=""
cleanup() {
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

STAGE_RETRY_LIMIT="${K8S_RELEASE_GATE_STAGE_RETRIES:-0}"
if ! [[ "${STAGE_RETRY_LIMIT}" =~ ^[0-9]+$ ]]; then
  echo "[k8s-release-gate] K8S_RELEASE_GATE_STAGE_RETRIES must be a non-negative integer." >&2
  exit 2
fi

LAST_STAGE_ATTEMPTS=0
run_stage() {
  local label="$1"
  shift
  echo ""
  echo "[k8s-release-gate] ${label}"
  local attempt=0
  while true; do
    attempt=$((attempt + 1))
    if "$@"; then
      LAST_STAGE_ATTEMPTS="${attempt}"
      return 0
    fi
    if (( attempt > STAGE_RETRY_LIMIT )); then
      LAST_STAGE_ATTEMPTS="${attempt}"
      return 1
    fi
    echo "[k8s-release-gate] Retrying stage '${label}' (${attempt}/${STAGE_RETRY_LIMIT})"
  done
}

backend_status="skipped"
backend_started_at=""
backend_finished_at=""
backend_attempts=0

k8s_up_status="skipped"
k8s_up_started_at=""
k8s_up_finished_at=""
k8s_up_attempts=0

port_forward_status="skipped"
port_forward_started_at=""
port_forward_finished_at=""
port_forward_attempts=0

k8s_validation_status="skipped"
k8s_validation_started_at=""
k8s_validation_finished_at=""
k8s_validation_attempts=0

frontend_e2e_status="skipped"
frontend_e2e_started_at=""
frontend_e2e_finished_at=""
frontend_e2e_attempts=0

overall_ok=true
flake_marker=false

write_summary() {
  cat >"${SUMMARY_FILE}" <<EOF
{
  "ok": ${overall_ok},
  "generatedAt": "$(now_utc)",
  "namespace": "${NAMESPACE}",
  "stageRetryLimit": ${STAGE_RETRY_LIMIT},
  "flakeMarker": ${flake_marker},
  "stages": {
    "backendMatrix": "${backend_status}",
    "k8sUp": "${k8s_up_status}",
    "portForward": "${port_forward_status}",
    "k8sValidation": "${k8s_validation_status}",
    "frontendE2EOnK8s": "${frontend_e2e_status}"
  },
  "stageDetails": {
    "backendMatrix": { "startedAt": "${backend_started_at}", "finishedAt": "${backend_finished_at}", "attempts": ${backend_attempts} },
    "k8sUp": { "startedAt": "${k8s_up_started_at}", "finishedAt": "${k8s_up_finished_at}", "attempts": ${k8s_up_attempts} },
    "portForward": { "startedAt": "${port_forward_started_at}", "finishedAt": "${port_forward_finished_at}", "attempts": ${port_forward_attempts} },
    "k8sValidation": { "startedAt": "${k8s_validation_started_at}", "finishedAt": "${k8s_validation_finished_at}", "attempts": ${k8s_validation_attempts} },
    "frontendE2EOnK8s": { "startedAt": "${frontend_e2e_started_at}", "finishedAt": "${frontend_e2e_finished_at}", "attempts": ${frontend_e2e_attempts} }
  },
  "k8sValidationSummaryFile": "${ARTIFACT_DIR}/k8s-validation-summary.json"
}
EOF
}

fail_stage() {
  local stage="$1"
  echo "[k8s-release-gate] FAILED stage: ${stage}" >&2
  overall_ok=false
  write_summary
  exit 1
}

cd "${ROOT_DIR}"

backend_status="running"
backend_started_at="$(now_utc)"
if run_stage "Backend full matrix (backend scope)" bash scripts/run-full-matrix.sh --backend; then
  backend_status="passed"
  backend_attempts="${LAST_STAGE_ATTEMPTS}"
  (( backend_attempts > 1 )) && flake_marker=true
else
  backend_status="failed"
  backend_attempts="${LAST_STAGE_ATTEMPTS}"
  backend_finished_at="$(now_utc)"
  fail_stage "backendMatrix"
fi
backend_finished_at="$(now_utc)"

k8s_up_status="running"
k8s_up_started_at="$(now_utc)"
if run_stage "K8s deploy (full up)" bash backend/backendA-platform-infra/scripts/k8s-local-up.sh; then
  k8s_up_status="passed"
  k8s_up_attempts="${LAST_STAGE_ATTEMPTS}"
  (( k8s_up_attempts > 1 )) && flake_marker=true
else
  k8s_up_status="failed"
  k8s_up_attempts="${LAST_STAGE_ATTEMPTS}"
  k8s_up_finished_at="$(now_utc)"
  fail_stage "k8sUp"
fi
k8s_up_finished_at="$(now_utc)"

port_forward_status="running"
port_forward_started_at="$(now_utc)"
echo ""
echo "[k8s-release-gate] K8s port-forward bootstrap"
bash backend/backendA-platform-infra/scripts/k8s-local-port-forward.sh >/tmp/maple-k8s-release-gate-port-forward.log 2>&1 &
PORT_FORWARD_PID="$!"
sleep 5
if kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
  sleep 5
  port_forward_status="passed"
  port_forward_attempts=1
else
  port_forward_status="failed"
  port_forward_attempts=1
  port_forward_finished_at="$(now_utc)"
  fail_stage "portForward"
fi
port_forward_finished_at="$(now_utc)"

k8s_validation_status="running"
k8s_validation_started_at="$(now_utc)"
if run_stage "K8s targeted validations" bash scripts/run-k8s-validation.sh --skip-up --skip-port-forward; then
  k8s_validation_status="passed"
  k8s_validation_attempts="${LAST_STAGE_ATTEMPTS}"
  (( k8s_validation_attempts > 1 )) && flake_marker=true
else
  k8s_validation_status="failed"
  k8s_validation_attempts="${LAST_STAGE_ATTEMPTS}"
  k8s_validation_finished_at="$(now_utc)"
  fail_stage "k8sValidation"
fi
k8s_validation_finished_at="$(now_utc)"

frontend_e2e_status="running"
frontend_e2e_started_at="$(now_utc)"
if run_stage "Frontend Playwright E2E against K8s surfaces" bash -lc '
  npm run test:frontend:setup:ci
  PLAYWRIGHT_FRONTEND_A_URL="http://127.0.0.1:3100" \
  PLAYWRIGHT_FRONTEND_B_URL="http://127.0.0.1:3200" \
  PLAYWRIGHT_FRONTEND_C_URL="http://127.0.0.1:3300" \
  npm run test:frontend:e2e
'; then
  frontend_e2e_status="passed"
  frontend_e2e_attempts="${LAST_STAGE_ATTEMPTS}"
  (( frontend_e2e_attempts > 1 )) && flake_marker=true
else
  frontend_e2e_status="failed"
  frontend_e2e_attempts="${LAST_STAGE_ATTEMPTS}"
  frontend_e2e_finished_at="$(now_utc)"
  fail_stage "frontendE2EOnK8s"
fi
frontend_e2e_finished_at="$(now_utc)"

kubectl -n "${NAMESPACE}" get deploy,svc,pods -o wide >"${ARTIFACT_DIR}/k8s-release-gate-cluster-status.txt" || true
kubectl -n "${NAMESPACE}" get events --sort-by=.metadata.creationTimestamp >"${ARTIFACT_DIR}/k8s-release-gate-events.txt" || true
kubectl -n "${NAMESPACE}" get all -o yaml >"${ARTIFACT_DIR}/k8s-release-gate-manifests.yaml" || true

write_summary
echo "[k8s-release-gate] Completed. Summary: ${SUMMARY_FILE}"
