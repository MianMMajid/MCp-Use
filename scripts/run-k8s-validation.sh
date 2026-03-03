#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${ARTIFACT_DIR}/k8s-validation-summary.json"
CHECKS_FILE="${ARTIFACT_DIR}/k8s-validation-checks.ndjson"
K8S_UTILIZATION_LIVE_FILE="${ARTIFACT_DIR}/k8s-service-utilization-live.json"
K8S_UTILIZATION_SUMMARY_FILE="${ARTIFACT_DIR}/k8s-service-utilization-summary.json"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"

mkdir -p "${ARTIFACT_DIR}"
rm -f "${CHECKS_FILE}"

SKIP_UP=0
SKIP_PORT_FORWARD=0
UP_ARGS=(--skip-build --skip-load --skip-restart)

while (( $# > 0 )); do
  case "$1" in
    --full)
      UP_ARGS=()
      ;;
    --skip-up)
      SKIP_UP=1
      ;;
    --skip-port-forward)
      SKIP_PORT_FORWARD=1
      ;;
    --skip-build|--skip-load|--skip-restart|--wait-only)
      UP_ARGS+=("$1")
      ;;
    *)
      echo "[k8s-validation] Unknown argument: $1" >&2
      echo "Usage: bash scripts/run-k8s-validation.sh [--full] [--skip-up] [--skip-port-forward] [--skip-build] [--skip-load] [--skip-restart] [--wait-only]" >&2
      exit 2
      ;;
  esac
  shift
done

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

PORT_FORWARD_PID=""
cleanup() {
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

record_check() {
  local name="$1"
  local url="$2"
  local method="$3"
  local status="$4"
  local ok="$5"
  local mode="$6"
  printf '{"name":"%s","url":"%s","method":"%s","status":%s,"ok":%s,"mode":"%s"}\n' \
    "$name" "$url" "$method" "$status" "$ok" "$mode" >>"${CHECKS_FILE}"
}

fetch_json() {
  local name="$1"
  local url="$2"
  local output_file="$3"
  local code
  code="$(curl -k -sS -o "${output_file}" -w "%{http_code}" \
    -H "x-api-key: local-demo-key" \
    -H "content-type: application/json" \
    "${url}" || true)"
  if ! [[ "${code}" =~ ^[0-9]{3}$ ]]; then
    code=0
  else
    code=$((10#${code}))
  fi
  local ok=false
  if [ "${code}" = "200" ]; then
    ok=true
  fi
  record_check "${name}" "${url}" "GET" "${code}" "${ok}" "strict200"
  if [ "${ok}" != "true" ]; then
    echo "[k8s-validation] FAIL ${name} -> HTTP ${code} (${url})"
    return 1
  fi
  echo "[k8s-validation] PASS ${name} -> HTTP ${code}"
}

probe() {
  local name="$1"
  local url="$2"
  local method="$3"
  local mode="$4"
  local payload="${5:-}"
  local code
  local ok=false
  local curl_args=(
    -k
    -sS
    -o /dev/null
    -w "%{http_code}"
    -X "${method}"
    -H "x-api-key: local-demo-key"
    -H "content-type: application/json"
  )
  if [ -n "${payload}" ]; then
    curl_args+=(-d "${payload}")
  fi
  code="$(curl "${curl_args[@]}" "${url}" || true)"
  if ! [[ "${code}" =~ ^[0-9]{3}$ ]]; then
    code=0
  else
    code=$((10#${code}))
  fi

  case "${mode}" in
    strict200)
      if [ "${code}" = "200" ]; then
        ok=true
      fi
      ;;
    endpoint)
      if [ "${code}" != "0" ] && [ "${code}" != "404" ] && [ "${code}" != "410" ]; then
        ok=true
      fi
      ;;
    page)
      case "${code}" in
        200|301|302|307|308)
          ok=true
          ;;
      esac
      ;;
    *)
      echo "[k8s-validation] Unknown probe mode: ${mode}" >&2
      exit 2
      ;;
  esac

  record_check "${name}" "${url}" "${method}" "${code}" "${ok}" "${mode}"
  if [ "${ok}" != "true" ]; then
    echo "[k8s-validation] FAIL ${name} -> HTTP ${code} (${url})"
    return 1
  fi
  echo "[k8s-validation] PASS ${name} -> HTTP ${code}"
}

OVERALL_OK=true

if (( SKIP_UP == 0 )); then
  echo "[k8s-validation] Bringing up local K8s stack: ${UP_ARGS[*]:-(full)}"
  bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-up.sh" "${UP_ARGS[@]}"
fi

if (( SKIP_PORT_FORWARD == 0 )); then
  echo "[k8s-validation] Starting K8s port-forwards"
  bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-port-forward.sh" &
  PORT_FORWARD_PID="$!"
  sleep 5
fi

{
  probe "gateway-health" "https://127.0.0.1:3000/health" "GET" "strict200"
  probe "runtime-dependencies" "https://127.0.0.1:3000/api/runtime/dependencies" "GET" "endpoint"
  probe "chat-capabilities" "https://127.0.0.1:3000/api/chat/capabilities" "GET" "endpoint"
  probe "firewall-chat-synthetic" "https://127.0.0.1:3000/api/firewall/chat" "POST" "endpoint" '{"message":"k8s validation synthetic service journey"}'
  probe "business-entitlements" "https://127.0.0.1:3000/api/entitlements" "GET" "endpoint"
  probe "downstream-dispatch-synthetic" "https://127.0.0.1:3000/api/downstream/dispatch" "POST" "endpoint" '{"toolName":"health_check","arguments":{}}'
  probe "orchestration-runtime-list" "https://127.0.0.1:3000/api/orchestrations/executions?limit=5" "GET" "endpoint"
  probe "observability-summary" "https://127.0.0.1:3000/api/observability/orchestrations/summary" "GET" "endpoint"
  probe "observability-slo" "https://127.0.0.1:3000/api/observability/orchestrations/slo?windowMs=3600000" "GET" "endpoint"
  probe "operations-step-up-status" "https://127.0.0.1:3000/api/operations/orchestrations/step-up/status" "GET" "endpoint"
  probe "operations-escalation-list" "https://127.0.0.1:3000/api/operations/orchestrations/escalation" "GET" "endpoint"
  probe "operations-break-glass-list" "https://127.0.0.1:3000/api/operations/orchestrations/break-glass" "GET" "endpoint"
  probe "operations-services-utilization" "https://127.0.0.1:3000/api/operations/services/utilization" "GET" "endpoint"
  probe "frontendA-observability" "http://127.0.0.1:3100/maple/observability" "GET" "page"
  probe "frontendB-orchestrate" "http://127.0.0.1:3200/orchestrate" "GET" "page"
  probe "frontendC-login" "http://127.0.0.1:3300/login" "GET" "page"
} || OVERALL_OK=false

if ! fetch_json "services-utilization-live-snapshot" \
  "https://127.0.0.1:3000/api/operations/services/utilization" \
  "${K8S_UTILIZATION_LIVE_FILE}"; then
  OVERALL_OK=false
fi

if ! SERVICE_AUDIT_POLICY=required \
  SERVICE_UTILIZATION_RUNTIME_REQUIRED=1 \
  node "${ROOT_DIR}/scripts/build-service-utilization-report.mjs" \
    --runtime-snapshot "${K8S_UTILIZATION_LIVE_FILE}" \
    --json-out "${K8S_UTILIZATION_SUMMARY_FILE}" \
    --md-out "${ARTIFACT_DIR}/k8s-service-utilization-summary.md"; then
  OVERALL_OK=false
fi

if ! SERVICE_AUDIT_POLICY=required \
  SERVICE_UTILIZATION_RUNTIME_REQUIRED=1 \
  node "${ROOT_DIR}/scripts/check-service-utilization-thresholds.mjs" \
    --report "${K8S_UTILIZATION_SUMMARY_FILE}"; then
  OVERALL_OK=false
fi

CHECKS_JSON="[]"
if [ -f "${CHECKS_FILE}" ] && [ -s "${CHECKS_FILE}" ]; then
  CHECKS_JSON="$(node -e '
const fs = require("node:fs");
const file = process.argv[1];
const rows = fs.readFileSync(file, "utf8").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
process.stdout.write(JSON.stringify(rows));
' "${CHECKS_FILE}")"
fi

RETIRED_SERVICES_JSON="[]"
if [ -f "${K8S_UTILIZATION_SUMMARY_FILE}" ]; then
  RETIRED_SERVICES_JSON="$(node -e '
const fs = require("node:fs");
const file = process.argv[1];
try {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const retired = parsed?.summary?.retiredServices;
  process.stdout.write(JSON.stringify(Array.isArray(retired) ? retired : []));
} catch {
  process.stdout.write("[]");
}
' "${K8S_UTILIZATION_SUMMARY_FILE}")"
fi

cat >"${SUMMARY_FILE}" <<EOF
{
  "ok": ${OVERALL_OK},
  "generatedAt": "$(now_utc)",
  "namespace": "${NAMESPACE}",
  "skipUp": $([[ "${SKIP_UP}" -eq 1 ]] && echo true || echo false),
  "skipPortForward": $([[ "${SKIP_PORT_FORWARD}" -eq 1 ]] && echo true || echo false),
  "k8sUpArgs": [$(printf '"%s"' "${UP_ARGS[@]}" | paste -sd, -)],
  "serviceUtilizationSummaryFile": "${K8S_UTILIZATION_SUMMARY_FILE}",
  "retiredServices": ${RETIRED_SERVICES_JSON},
  "checks": ${CHECKS_JSON}
}
EOF

echo "[k8s-validation] Summary written to ${SUMMARY_FILE}"

if [ "${OVERALL_OK}" != "true" ]; then
  exit 1
fi
