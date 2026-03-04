#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${ARTIFACT_DIR}/k8s-release-gate-summary.json"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
GATEWAY_LOCAL_PORT="${MAPLE_K8S_GATEWAY_LOCAL_PORT:-3000}"
REQUIRE_OPENCLAW_GATEWAY="${MAPLE_K8S_REQUIRE_OPENCLAW_GATEWAY:-1}"

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

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

validate_json_file() {
  local file="$1"
  local label="$2"
  if command -v jq >/dev/null 2>&1; then
    if ! jq '.' "$file" >/dev/null; then
      echo "[k8s-release-gate] Invalid JSON in ${label}: ${file}" >&2
      return 1
    fi
    return 0
  fi
  node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));' "$file" >/dev/null
}

as_bool() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "${raw}" == "1" || "${raw}" == "true" || "${raw}" == "yes" || "${raw}" == "on" ]]
}

OPENCLAW_GATEWAY_REQUIRED_BOOL=false
if as_bool "${REQUIRE_OPENCLAW_GATEWAY}"; then
  OPENCLAW_GATEWAY_REQUIRED_BOOL=true
fi

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

openclaw_gateway_status="skipped"
openclaw_gateway_started_at=""
openclaw_gateway_finished_at=""
openclaw_gateway_attempts=0

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
  "artifactSchemaVersion": 2,
  "ok": ${overall_ok},
  "generatedAt": "$(now_utc)",
  "namespace": "${NAMESPACE}",
  "gatewayLocalPort": ${GATEWAY_LOCAL_PORT},
  "openclawGatewayRequired": ${OPENCLAW_GATEWAY_REQUIRED_BOOL},
  "policyMode": "conditional_strict",
  "stageRetryLimit": ${STAGE_RETRY_LIMIT},
  "flakeMarker": ${flake_marker},
  "stages": {
    "backendMatrix": "${backend_status}",
    "k8sUp": "${k8s_up_status}",
    "openclawGateway": "${openclaw_gateway_status}",
    "portForward": "${port_forward_status}",
    "k8sValidation": "${k8s_validation_status}",
    "frontendE2EOnK8s": "${frontend_e2e_status}"
  },
  "stageDetails": {
    "backendMatrix": { "startedAt": "${backend_started_at}", "finishedAt": "${backend_finished_at}", "attempts": ${backend_attempts} },
    "k8sUp": { "startedAt": "${k8s_up_started_at}", "finishedAt": "${k8s_up_finished_at}", "attempts": ${k8s_up_attempts} },
    "openclawGateway": { "startedAt": "${openclaw_gateway_started_at}", "finishedAt": "${openclaw_gateway_finished_at}", "attempts": ${openclaw_gateway_attempts} },
    "portForward": { "startedAt": "${port_forward_started_at}", "finishedAt": "${port_forward_finished_at}", "attempts": ${port_forward_attempts} },
    "k8sValidation": { "startedAt": "${k8s_validation_started_at}", "finishedAt": "${k8s_validation_finished_at}", "attempts": ${k8s_validation_attempts} },
    "frontendE2EOnK8s": { "startedAt": "${frontend_e2e_started_at}", "finishedAt": "${frontend_e2e_finished_at}", "attempts": ${frontend_e2e_attempts} }
  },
  "k8sValidationSummaryFile": "${ARTIFACT_DIR}/k8s-validation-summary.json"
}
EOF
  validate_json_file "${SUMMARY_FILE}" "k8s release gate summary"
}

fail_stage() {
  local stage="$1"
  echo "[k8s-release-gate] FAILED stage: ${stage}" >&2
  overall_ok=false
  write_summary
  exit 1
}

cd "${ROOT_DIR}"

if [ "${GATEWAY_LOCAL_PORT}" = "3000" ] && port_in_use 3000; then
  GATEWAY_LOCAL_PORT="4300"
  echo "[k8s-release-gate] Local port 3000 is busy; using gateway port-forward on ${GATEWAY_LOCAL_PORT}."
fi

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

if ${OPENCLAW_GATEWAY_REQUIRED_BOOL}; then
  openclaw_gateway_status="running"
  openclaw_gateway_started_at="$(now_utc)"
  if run_stage "OpenClaw gateway rollout readiness" \
    kubectl -n "${NAMESPACE}" rollout status deployment/openclaw-gateway --timeout=120s; then
    openclaw_gateway_status="passed"
    openclaw_gateway_attempts="${LAST_STAGE_ATTEMPTS}"
    (( openclaw_gateway_attempts > 1 )) && flake_marker=true
  else
    openclaw_gateway_status="failed"
    openclaw_gateway_attempts="${LAST_STAGE_ATTEMPTS}"
    openclaw_gateway_finished_at="$(now_utc)"
    fail_stage "openclawGateway"
  fi
  openclaw_gateway_finished_at="$(now_utc)"
else
  openclaw_gateway_status="skipped"
  openclaw_gateway_started_at="$(now_utc)"
  openclaw_gateway_finished_at="${openclaw_gateway_started_at}"
fi

port_forward_status="running"
port_forward_started_at="$(now_utc)"
echo ""
echo "[k8s-release-gate] K8s port-forward bootstrap"
MAPLE_K8S_GATEWAY_LOCAL_PORT="${GATEWAY_LOCAL_PORT}" \
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
if run_stage "K8s targeted validations" env MAPLE_K8S_GATEWAY_LOCAL_PORT="${GATEWAY_LOCAL_PORT}" bash scripts/run-k8s-validation.sh --skip-up --skip-port-forward; then
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
