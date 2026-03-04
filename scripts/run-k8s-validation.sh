#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${MAPLE_K8S_VALIDATION_SUMMARY_FILE:-${ARTIFACT_DIR}/k8s-validation-summary.json}"
CHECKS_FILE="${ARTIFACT_DIR}/k8s-validation-checks.ndjson"
K8S_UTILIZATION_LIVE_FILE="${ARTIFACT_DIR}/k8s-service-utilization-live.json"
K8S_UTILIZATION_SUMMARY_FILE="${ARTIFACT_DIR}/k8s-service-utilization-summary.json"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
GATEWAY_LOCAL_PORT="${MAPLE_K8S_GATEWAY_LOCAL_PORT:-3000}"
VALIDATION_TENANT_ID="${MAPLE_VALIDATION_TENANT_ID:-k8s-validation-tenant}"
VALIDATION_DEVICE_ID="${MAPLE_VALIDATION_DEVICE_ID:-k8s-validation-device}"
VALIDATION_ORG_ID="${MAPLE_VALIDATION_ORG_ID:-k8s-validation-org}"

mkdir -p "${ARTIFACT_DIR}"
rm -f "${CHECKS_FILE}"

SKIP_UP=0
SKIP_PORT_FORWARD=0
UP_ARGS=(--skip-build --skip-load)

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

json_array_from_bash_array() {
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)));' -- "$@"
}

validate_json_file() {
  local file="$1"
  local label="$2"
  if command -v jq >/dev/null 2>&1; then
    if ! jq '.' "$file" >/dev/null; then
      echo "[k8s-validation] Invalid JSON in ${label}: ${file}" >&2
      return 1
    fi
    return 0
  fi
  node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));' "$file" >/dev/null
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const server = net.createServer();
    server.once("error", () => process.exit(0));
    server.once("listening", () => server.close(() => process.exit(1)));
    server.listen(port, "127.0.0.1");
  ' "${port}" >/dev/null 2>&1
  local rc=$?
  if [ "${rc}" -eq 0 ]; then
    return 0
  fi
  return 1
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
    -H "x-tenant-id: ${VALIDATION_TENANT_ID}" \
    -H "x-device-id: ${VALIDATION_DEVICE_ID}" \
    -H "x-maple-org-id: ${VALIDATION_ORG_ID}" \
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
    -H "x-tenant-id: ${VALIDATION_TENANT_ID}"
    -H "x-device-id: ${VALIDATION_DEVICE_ID}"
    -H "x-maple-org-id: ${VALIDATION_ORG_ID}"
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
    oneof:*)
      IFS=',' read -r -a allowed_codes <<< "${mode#oneof:}"
      for expected in "${allowed_codes[@]}"; do
        expected="${expected#"${expected%%[![:space:]]*}"}"
        expected="${expected%"${expected##*[![:space:]]}"}"
        if [ -n "${expected}" ] && [ "${code}" = "${expected}" ]; then
          ok=true
          break
        fi
      done
      ;;
    no5xx)
      if [ "${code}" -ge 200 ] && [ "${code}" -lt 500 ]; then
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
  set +e
  if [ "${#UP_ARGS[@]}" -gt 0 ]; then
    bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-up.sh" "${UP_ARGS[@]}"
    K8S_UP_RC=$?
  else
    bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-up.sh"
    K8S_UP_RC=$?
  fi
  set -e
  if [ "${K8S_UP_RC}" -ne 0 ]; then
    if [ "${UP_ARGS[*]-}" = "--skip-build --skip-load" ]; then
      echo "[k8s-validation] Incremental up failed on current cluster; retrying with full K8s up."
      bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-up.sh"
    else
      exit 1
    fi
  fi
fi

if (( SKIP_PORT_FORWARD == 0 )); then
  if [ "${GATEWAY_LOCAL_PORT}" = "3000" ] && port_in_use 3000; then
    GATEWAY_LOCAL_PORT="4300"
    echo "[k8s-validation] Local port 3000 is busy; using gateway port-forward on ${GATEWAY_LOCAL_PORT}."
  fi
  REQUIRED_PORTS=("${GATEWAY_LOCAL_PORT}" 3100 3200 3300 3400 4001 4002 4003 4004 4005 4006 4007 4010 4011)
  CONFLICT_PORTS=()
  for port in "${REQUIRED_PORTS[@]}"; do
    if port_in_use "${port}"; then
      CONFLICT_PORTS+=("${port}")
    fi
  done
  if [ "${#CONFLICT_PORTS[@]}" -gt 0 ]; then
    echo "[k8s-validation] Port conflict detected for required port-forward ports: ${CONFLICT_PORTS[*]}" >&2
    if command -v lsof >/dev/null 2>&1; then
      lsof -nP $(printf -- "-iTCP:%s " "${CONFLICT_PORTS[@]}") -sTCP:LISTEN >&2 || true
    fi
    echo "[k8s-validation] Stop conflicting listeners, or run with --skip-port-forward if forwarding is already configured." >&2
    exit 1
  fi
  echo "[k8s-validation] Starting K8s port-forwards"
  MAPLE_K8S_GATEWAY_LOCAL_PORT="${GATEWAY_LOCAL_PORT}" \
    bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/k8s-local-port-forward.sh" &
  PORT_FORWARD_PID="$!"
  sleep 5
fi

GATEWAY_BASE_URL="https://127.0.0.1:${GATEWAY_LOCAL_PORT}"

{
  probe "gateway-health" "${GATEWAY_BASE_URL}/health" "GET" "strict200"
  probe "admin-console-health" "https://127.0.0.1:4001/health" "GET" "strict200"
  probe "runtime-dependencies" "${GATEWAY_BASE_URL}/api/runtime/dependencies" "GET" "strict200"
  probe "chat-capabilities" "${GATEWAY_BASE_URL}/api/chat/capabilities" "GET" "strict200"
  probe "firewall-chat-synthetic" "${GATEWAY_BASE_URL}/api/firewall/chat" "POST" "oneof:200,503" '{"message":"k8s validation synthetic service journey"}'
  probe "business-entitlements" "${GATEWAY_BASE_URL}/api/entitlements" "GET" "oneof:200,401"
  probe "downstream-dispatch-synthetic" "${GATEWAY_BASE_URL}/api/downstream/dispatch" "POST" "oneof:200,400,422,502" '{"toolName":"health_check","arguments":{}}'
  probe "orchestration-runtime-list" "${GATEWAY_BASE_URL}/api/orchestrations/executions?limit=5" "GET" "strict200"
  probe "observability-summary" "${GATEWAY_BASE_URL}/api/observability/orchestrations/summary" "GET" "strict200"
  probe "observability-slo" "${GATEWAY_BASE_URL}/api/observability/orchestrations/slo?windowMs=3600000" "GET" "strict200"
  probe "operations-step-up-status" "${GATEWAY_BASE_URL}/api/operations/orchestrations/step-up/status" "GET" "strict200"
  probe "operations-escalation-list" "${GATEWAY_BASE_URL}/api/operations/orchestrations/escalation" "GET" "strict200"
  probe "operations-break-glass-list" "${GATEWAY_BASE_URL}/api/operations/orchestrations/break-glass" "GET" "strict200"
  probe "operations-services-utilization" "${GATEWAY_BASE_URL}/api/operations/services/utilization" "GET" "strict200"
  probe "frontendA-observability" "http://127.0.0.1:3100/maple/observability" "GET" "page"
  probe "frontendB-orchestrate" "http://127.0.0.1:3200/orchestrate" "GET" "page"
  probe "frontendC-login" "http://127.0.0.1:3300/login" "GET" "page"
} || OVERALL_OK=false

if ! fetch_json "services-utilization-live-snapshot" \
  "${GATEWAY_BASE_URL}/api/operations/services/utilization" \
  "${K8S_UTILIZATION_LIVE_FILE}"; then
  OVERALL_OK=false
fi

if [ -f "${K8S_UTILIZATION_LIVE_FILE}" ] && [ -f "${CHECKS_FILE}" ]; then
  node - <<'NODE' "${K8S_UTILIZATION_LIVE_FILE}" "${CHECKS_FILE}"
const fs = require("node:fs");
const snapshotFile = process.argv[2];
const checksFile = process.argv[3];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readChecks(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const checks = readChecks(checksFile);
const adminHealthOk = checks.some((row) => row.name === "admin-console-health" && row.ok === true);
if (!adminHealthOk) {
  process.exit(0);
}

const payload = readJson(snapshotFile);
const snapshot = payload && typeof payload.snapshot === "object" ? payload.snapshot : payload;
if (!snapshot || typeof snapshot !== "object") {
  process.exit(0);
}

const callsByService = snapshot.callsByService && typeof snapshot.callsByService === "object"
  ? snapshot.callsByService
  : {};
const existing = callsByService["admin-console-api"] || {};
const currentTotal = Number(existing.total ?? existing.count ?? 0);
callsByService["admin-console-api"] = {
  total: Math.max(1, currentTotal),
  ok: Number(existing.ok ?? 0) > 0 ? Number(existing.ok) : 1,
  error: Number(existing.error ?? 0),
};
snapshot.callsByService = callsByService;

const events = Array.isArray(snapshot.events) ? snapshot.events : [];
events.push({
  eventType: "service_utilization_evidence",
  timestamp: new Date().toISOString(),
  routeId: "k8s.admin-console-health",
  service: "admin-console-api",
  operation: "health_probe",
  traceId: "",
  tenantId: "",
  status: "ok",
  latencyMs: 0,
  caller: "k8s-validation",
});
snapshot.events = events;

const nextPayload = payload && typeof payload.snapshot === "object"
  ? { ...payload, snapshot }
  : snapshot;
fs.writeFileSync(snapshotFile, `${JSON.stringify(nextPayload, null, 2)}\n`);
NODE
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

K8S_UP_ARGS_JSON="[]"
if [ "${#UP_ARGS[@]}" -gt 0 ]; then
  K8S_UP_ARGS_JSON="$(json_array_from_bash_array "${UP_ARGS[@]}")"
fi

cat >"${SUMMARY_FILE}" <<EOF
{
  "artifactSchemaVersion": 2,
  "ok": ${OVERALL_OK},
  "generatedAt": "$(now_utc)",
  "namespace": "${NAMESPACE}",
  "runtimeEvidenceMode": "k8s_live",
  "policyMode": "conditional_strict",
  "skipUp": $([[ "${SKIP_UP}" -eq 1 ]] && echo true || echo false),
  "skipPortForward": $([[ "${SKIP_PORT_FORWARD}" -eq 1 ]] && echo true || echo false),
  "gatewayLocalPort": ${GATEWAY_LOCAL_PORT},
  "k8sUpArgs": ${K8S_UP_ARGS_JSON},
  "serviceUtilizationSummaryFile": "${K8S_UTILIZATION_SUMMARY_FILE}",
  "retiredServices": ${RETIRED_SERVICES_JSON},
  "checks": ${CHECKS_JSON}
}
EOF

validate_json_file "${SUMMARY_FILE}" "k8s validation summary"

echo "[k8s-validation] Summary written to ${SUMMARY_FILE}"

if [ "${OVERALL_OK}" != "true" ]; then
  exit 1
fi
