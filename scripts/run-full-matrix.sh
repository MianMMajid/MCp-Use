#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/artifacts/matrix"
SUMMARY_FILE="$ARTIFACT_DIR/full-matrix-summary.json"
LIVE_SKIP_FILE="$ARTIFACT_DIR/live-suite-skip.json"

mkdir -p "$ARTIFACT_DIR"

RUN_BACKEND=0
RUN_FRONTEND=0
RUN_LIVE=1

if (( $# == 0 )); then
  RUN_BACKEND=1
  RUN_FRONTEND=1
fi

while (( $# > 0 )); do
  case "$1" in
    --backend)
      RUN_BACKEND=1
      ;;
    --frontend)
      RUN_FRONTEND=1
      ;;
    --no-live)
      RUN_LIVE=0
      ;;
    --all)
      RUN_BACKEND=1
      RUN_FRONTEND=1
      ;;
    *)
      printf '[full-matrix] Unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

if (( RUN_BACKEND == 0 && RUN_FRONTEND == 0 )); then
  printf '[full-matrix] Nothing selected. Use --backend, --frontend, or --all.\n' >&2
  exit 2
fi

STAGE_RETRY_LIMIT="${FULL_MATRIX_STAGE_RETRIES:-0}"
if ! [[ "$STAGE_RETRY_LIMIT" =~ ^[0-9]+$ ]]; then
  printf '[full-matrix] FULL_MATRIX_STAGE_RETRIES must be a non-negative integer.\n' >&2
  exit 2
fi

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

as_bool() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$raw" == "1" || "$raw" == "true" || "$raw" == "yes" || "$raw" == "on" ]]
}

FORCE_LIVE=0
if as_bool "${FULL_MATRIX_FORCE_LIVE:-0}"; then
  FORCE_LIVE=1
fi

validate_json_file() {
  local file="$1"
  local label="$2"
  if command -v jq >/dev/null 2>&1; then
    if ! jq '.' "$file" >/dev/null; then
      printf '[full-matrix] Invalid JSON in %s: %s\n' "$label" "$file" >&2
      return 1
    fi
    return 0
  fi
  node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));' "$file" >/dev/null
}

write_live_skip_file() {
  local reason="$1"
  shift
  local missing=("$@")
  {
    printf '{\n'
    printf '  "artifactSchemaVersion": 2,\n'
    printf '  "ok": true,\n'
    printf '  "skipped": true,\n'
    printf '  "policyMode": "conditional_strict",\n'
    printf '  "reason": "%s",\n' "$reason"
    printf '  "generatedAt": "%s",\n' "$(now_utc)"
    printf '  "missingEnv": ['
    for i in "${!missing[@]}"; do
      [[ "$i" -gt 0 ]] && printf ', '
      printf '"%s"' "${missing[$i]}"
    done
    printf ']\n'
    printf '}\n'
  } >"$LIVE_SKIP_FILE"
  validate_json_file "$LIVE_SKIP_FILE" "live-suite skip artifact"
  if command -v jq >/dev/null 2>&1; then
    if ! jq -e '.generatedAt and .reason and (.missingEnv|type=="array") and .policyMode' "$LIVE_SKIP_FILE" >/dev/null 2>&1; then
      printf '[full-matrix] Invalid live skip artifact contract: %s\n' "$LIVE_SKIP_FILE" >&2
      return 1
    fi
  else
    node -e '
      const fs = require("node:fs");
      const parsed = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (!parsed?.generatedAt || !parsed?.reason || !Array.isArray(parsed?.missingEnv) || !parsed?.policyMode) {
        process.exit(1);
      }
    ' "$LIVE_SKIP_FILE"
  fi
  printf '[full-matrix] Live matrix skipped; wrote %s\n' "$LIVE_SKIP_FILE"
}

LAST_STAGE_ATTEMPTS=0
run_stage() {
  local label="$1"
  shift
  printf '\n[full-matrix] %s\n' "$label"

  local attempt=0
  while true; do
    attempt=$((attempt + 1))
    if "$@"; then
      LAST_STAGE_ATTEMPTS="$attempt"
      return 0
    fi
    if (( attempt > STAGE_RETRY_LIMIT )); then
      LAST_STAGE_ATTEMPTS="$attempt"
      return 1
    fi
    printf '[full-matrix] Retrying stage "%s" (%s/%s)\n' "$label" "$attempt" "$STAGE_RETRY_LIMIT"
  done
}

guard_status="skipped"
guard_started_at=""
guard_finished_at=""
guard_attempts=0

source_packages_status="skipped"
source_packages_started_at=""
source_packages_finished_at=""
source_packages_attempts=0

repo_hygiene_status="skipped"
repo_hygiene_started_at=""
repo_hygiene_finished_at=""
repo_hygiene_attempts=0

lockfile_policy_status="skipped"
lockfile_policy_started_at=""
lockfile_policy_finished_at=""
lockfile_policy_attempts=0

deprecated_alias_status="skipped"
deprecated_alias_started_at=""
deprecated_alias_finished_at=""
deprecated_alias_attempts=0

command_surface_status="skipped"
command_surface_started_at=""
command_surface_finished_at=""
command_surface_attempts=0

docs_drift_status="skipped"
docs_drift_started_at=""
docs_drift_finished_at=""
docs_drift_attempts=0

dependency_security_status="skipped"
dependency_security_started_at=""
dependency_security_finished_at=""
dependency_security_attempts=0

inventory_status="skipped"
inventory_started_at=""
inventory_finished_at=""
inventory_attempts=0

static_callgraph_status="skipped"
static_callgraph_started_at=""
static_callgraph_finished_at=""
static_callgraph_attempts=0

topology_parity_status="skipped"
topology_parity_started_at=""
topology_parity_finished_at=""
topology_parity_attempts=0

runtime_utilization_status="skipped"
runtime_utilization_started_at=""
runtime_utilization_finished_at=""
runtime_utilization_attempts=0

threshold_evaluation_status="skipped"
threshold_evaluation_started_at=""
threshold_evaluation_finished_at=""
threshold_evaluation_attempts=0

backend_mesh_status="skipped"
backend_mesh_started_at=""
backend_mesh_finished_at=""
backend_mesh_attempts=0

backend_saas_status="skipped"
backend_saas_started_at=""
backend_saas_finished_at=""
backend_saas_attempts=0

backend_infra_status="skipped"
backend_infra_started_at=""
backend_infra_finished_at=""
backend_infra_attempts=0

backend_heavy_status="skipped"
backend_heavy_started_at=""
backend_heavy_finished_at=""
backend_heavy_attempts=0

frontend_b_surface_status="skipped"
frontend_b_surface_started_at=""
frontend_b_surface_finished_at=""
frontend_b_surface_attempts=0

frontend_flow_status="skipped"
frontend_flow_started_at=""
frontend_flow_finished_at=""
frontend_flow_attempts=0

live_status="skipped"
live_started_at=""
live_finished_at=""
live_attempts=0

overall_ok=true
flake_marker=false

write_summary() {
  cat >"$SUMMARY_FILE" <<EOF
{
  "artifactSchemaVersion": 2,
  "ok": $overall_ok,
  "generatedAt": "$(now_utc)",
  "scope": {
    "backend": $([[ "$RUN_BACKEND" -eq 1 ]] && echo true || echo false),
    "frontend": $([[ "$RUN_FRONTEND" -eq 1 ]] && echo true || echo false),
    "live": $([[ "$RUN_LIVE" -eq 1 ]] && echo true || echo false),
    "forcedLive": $([[ "$FORCE_LIVE" -eq 1 ]] && echo true || echo false)
  },
  "coveragePolicy": "${COVERAGE_POLICY:-advisory}",
  "stageRetryLimit": $STAGE_RETRY_LIMIT,
  "flakeMarker": $flake_marker,
  "stages": {
    "guard": "$guard_status",
    "sourcePackages": "$source_packages_status",
    "repoHygiene": "$repo_hygiene_status",
    "lockfilePolicy": "$lockfile_policy_status",
    "deprecatedCommandAliases": "$deprecated_alias_status",
    "commandSurface": "$command_surface_status",
    "docsDrift": "$docs_drift_status",
    "dependencySecurity": "$dependency_security_status",
    "inventory": "$inventory_status",
    "staticCallgraph": "$static_callgraph_status",
    "topologyParity": "$topology_parity_status",
    "runtimeUtilization": "$runtime_utilization_status",
    "thresholdEvaluation": "$threshold_evaluation_status",
    "backendMesh": "$backend_mesh_status",
    "backendSaas": "$backend_saas_status",
    "backendInfra": "$backend_infra_status",
    "backendHeavy": "$backend_heavy_status",
    "frontendBSurface": "$frontend_b_surface_status",
    "frontendFlow": "$frontend_flow_status",
    "liveProviderMatrix": "$live_status"
  },
  "stageDetails": {
    "guard": { "startedAt": "$guard_started_at", "finishedAt": "$guard_finished_at", "attempts": $guard_attempts },
    "sourcePackages": { "startedAt": "$source_packages_started_at", "finishedAt": "$source_packages_finished_at", "attempts": $source_packages_attempts },
    "repoHygiene": { "startedAt": "$repo_hygiene_started_at", "finishedAt": "$repo_hygiene_finished_at", "attempts": $repo_hygiene_attempts },
    "lockfilePolicy": { "startedAt": "$lockfile_policy_started_at", "finishedAt": "$lockfile_policy_finished_at", "attempts": $lockfile_policy_attempts },
    "deprecatedCommandAliases": { "startedAt": "$deprecated_alias_started_at", "finishedAt": "$deprecated_alias_finished_at", "attempts": $deprecated_alias_attempts },
    "commandSurface": { "startedAt": "$command_surface_started_at", "finishedAt": "$command_surface_finished_at", "attempts": $command_surface_attempts },
    "docsDrift": { "startedAt": "$docs_drift_started_at", "finishedAt": "$docs_drift_finished_at", "attempts": $docs_drift_attempts },
    "dependencySecurity": { "startedAt": "$dependency_security_started_at", "finishedAt": "$dependency_security_finished_at", "attempts": $dependency_security_attempts },
    "inventory": { "startedAt": "$inventory_started_at", "finishedAt": "$inventory_finished_at", "attempts": $inventory_attempts },
    "staticCallgraph": { "startedAt": "$static_callgraph_started_at", "finishedAt": "$static_callgraph_finished_at", "attempts": $static_callgraph_attempts },
    "topologyParity": { "startedAt": "$topology_parity_started_at", "finishedAt": "$topology_parity_finished_at", "attempts": $topology_parity_attempts },
    "runtimeUtilization": { "startedAt": "$runtime_utilization_started_at", "finishedAt": "$runtime_utilization_finished_at", "attempts": $runtime_utilization_attempts },
    "thresholdEvaluation": { "startedAt": "$threshold_evaluation_started_at", "finishedAt": "$threshold_evaluation_finished_at", "attempts": $threshold_evaluation_attempts },
    "backendMesh": { "startedAt": "$backend_mesh_started_at", "finishedAt": "$backend_mesh_finished_at", "attempts": $backend_mesh_attempts },
    "backendSaas": { "startedAt": "$backend_saas_started_at", "finishedAt": "$backend_saas_finished_at", "attempts": $backend_saas_attempts },
    "backendInfra": { "startedAt": "$backend_infra_started_at", "finishedAt": "$backend_infra_finished_at", "attempts": $backend_infra_attempts },
    "backendHeavy": { "startedAt": "$backend_heavy_started_at", "finishedAt": "$backend_heavy_finished_at", "attempts": $backend_heavy_attempts },
    "frontendBSurface": { "startedAt": "$frontend_b_surface_started_at", "finishedAt": "$frontend_b_surface_finished_at", "attempts": $frontend_b_surface_attempts },
    "frontendFlow": { "startedAt": "$frontend_flow_started_at", "finishedAt": "$frontend_flow_finished_at", "attempts": $frontend_flow_attempts },
    "liveProviderMatrix": { "startedAt": "$live_started_at", "finishedAt": "$live_finished_at", "attempts": $live_attempts }
  }
}
EOF
  validate_json_file "$SUMMARY_FILE" "full matrix summary"
}

fail_stage() {
  local stage="$1"
  printf '[full-matrix] FAILED stage: %s\n' "$stage" >&2
  overall_ok=false
  write_summary
  exit 1
}

is_placeholder_secret() {
  local value="${1:-}"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$normalized" || "$normalized" == *"ci-test"* || "$normalized" == *"placeholder"* || "$normalized" == *"changeme"* ]]
}

guard_status="running"
guard_started_at="$(now_utc)"
if run_stage "Guard: no non-allowlisted legacy modifier endpoints" \
  bash "$ROOT_DIR/scripts/check-no-legacy-modifier-endpoints.sh"; then
  guard_status="passed"
  guard_attempts="$LAST_STAGE_ATTEMPTS"
  (( guard_attempts > 1 )) && flake_marker=true
else
  guard_status="failed"
  guard_attempts="$LAST_STAGE_ATTEMPTS"
  guard_finished_at="$(now_utc)"
  fail_stage "guard"
fi
guard_finished_at="$(now_utc)"

source_packages_status="running"
source_packages_started_at="$(now_utc)"
if run_stage "Guard: source-backed package link integrity" \
  bash "$ROOT_DIR/scripts/check-source-backed-packages.sh"; then
  source_packages_status="passed"
  source_packages_attempts="$LAST_STAGE_ATTEMPTS"
  (( source_packages_attempts > 1 )) && flake_marker=true
else
  source_packages_status="failed"
  source_packages_attempts="$LAST_STAGE_ATTEMPTS"
  source_packages_finished_at="$(now_utc)"
  fail_stage "source_packages"
fi
source_packages_finished_at="$(now_utc)"

repo_hygiene_status="running"
repo_hygiene_started_at="$(now_utc)"
if run_stage "Guard: repository hygiene" \
  bash "$ROOT_DIR/scripts/check-repo-hygiene.sh"; then
  repo_hygiene_status="passed"
  repo_hygiene_attempts="$LAST_STAGE_ATTEMPTS"
  (( repo_hygiene_attempts > 1 )) && flake_marker=true
else
  repo_hygiene_status="failed"
  repo_hygiene_attempts="$LAST_STAGE_ATTEMPTS"
  repo_hygiene_finished_at="$(now_utc)"
  fail_stage "repo_hygiene"
fi
repo_hygiene_finished_at="$(now_utc)"

lockfile_policy_status="running"
lockfile_policy_started_at="$(now_utc)"
if run_stage "Guard: lockfile surface policy" \
  bash "$ROOT_DIR/scripts/check-lockfile-policy.sh"; then
  lockfile_policy_status="passed"
  lockfile_policy_attempts="$LAST_STAGE_ATTEMPTS"
  (( lockfile_policy_attempts > 1 )) && flake_marker=true
else
  lockfile_policy_status="failed"
  lockfile_policy_attempts="$LAST_STAGE_ATTEMPTS"
  lockfile_policy_finished_at="$(now_utc)"
  fail_stage "lockfile_policy"
fi
lockfile_policy_finished_at="$(now_utc)"

deprecated_alias_status="running"
deprecated_alias_started_at="$(now_utc)"
if run_stage "Guard: deprecated command alias freeze" \
  node "$ROOT_DIR/scripts/check-deprecated-command-aliases.mjs"; then
  deprecated_alias_status="passed"
  deprecated_alias_attempts="$LAST_STAGE_ATTEMPTS"
  (( deprecated_alias_attempts > 1 )) && flake_marker=true
else
  deprecated_alias_status="failed"
  deprecated_alias_attempts="$LAST_STAGE_ATTEMPTS"
  deprecated_alias_finished_at="$(now_utc)"
  fail_stage "deprecated_aliases"
fi
deprecated_alias_finished_at="$(now_utc)"

command_surface_status="running"
command_surface_started_at="$(now_utc)"
if run_stage "Guard: root command surface budget" \
  node "$ROOT_DIR/scripts/check-command-surface.mjs"; then
  command_surface_status="passed"
  command_surface_attempts="$LAST_STAGE_ATTEMPTS"
  (( command_surface_attempts > 1 )) && flake_marker=true
else
  command_surface_status="failed"
  command_surface_attempts="$LAST_STAGE_ATTEMPTS"
  command_surface_finished_at="$(now_utc)"
  fail_stage "command_surface"
fi
command_surface_finished_at="$(now_utc)"

docs_drift_status="running"
docs_drift_started_at="$(now_utc)"
if run_stage "Guard: docs and architecture drift" \
  node "$ROOT_DIR/scripts/check-docs-architecture-drift.mjs"; then
  docs_drift_status="passed"
  docs_drift_attempts="$LAST_STAGE_ATTEMPTS"
  (( docs_drift_attempts > 1 )) && flake_marker=true
else
  docs_drift_status="failed"
  docs_drift_attempts="$LAST_STAGE_ATTEMPTS"
  docs_drift_finished_at="$(now_utc)"
  fail_stage "docs_drift"
fi
docs_drift_finished_at="$(now_utc)"

dependency_security_status="running"
dependency_security_started_at="$(now_utc)"
if run_stage "Guard: dependency/security high+critical policy" \
  node "$ROOT_DIR/scripts/dependency-security-pass.mjs"; then
  dependency_security_status="passed"
  dependency_security_attempts="$LAST_STAGE_ATTEMPTS"
  (( dependency_security_attempts > 1 )) && flake_marker=true
else
  dependency_security_status="failed"
  dependency_security_attempts="$LAST_STAGE_ATTEMPTS"
  dependency_security_finished_at="$(now_utc)"
  fail_stage "dependency_security"
fi
dependency_security_finished_at="$(now_utc)"

inventory_status="running"
inventory_started_at="$(now_utc)"
if run_stage "Service audit: inventory" node "$ROOT_DIR/scripts/service-inventory.mjs"; then
  inventory_status="passed"
  inventory_attempts="$LAST_STAGE_ATTEMPTS"
  (( inventory_attempts > 1 )) && flake_marker=true
else
  inventory_status="failed"
  inventory_attempts="$LAST_STAGE_ATTEMPTS"
  inventory_finished_at="$(now_utc)"
  fail_stage "inventory"
fi
inventory_finished_at="$(now_utc)"

static_callgraph_status="running"
static_callgraph_started_at="$(now_utc)"
if run_stage "Service audit: static callgraph" node "$ROOT_DIR/scripts/service-callgraph-static.mjs"; then
  static_callgraph_status="passed"
  static_callgraph_attempts="$LAST_STAGE_ATTEMPTS"
  (( static_callgraph_attempts > 1 )) && flake_marker=true
else
  static_callgraph_status="failed"
  static_callgraph_attempts="$LAST_STAGE_ATTEMPTS"
  static_callgraph_finished_at="$(now_utc)"
  fail_stage "static_callgraph"
fi
static_callgraph_finished_at="$(now_utc)"

topology_parity_status="running"
topology_parity_started_at="$(now_utc)"
if run_stage "Service audit: topology parity" node "$ROOT_DIR/scripts/check-service-topology-parity.mjs"; then
  topology_parity_status="passed"
  topology_parity_attempts="$LAST_STAGE_ATTEMPTS"
  (( topology_parity_attempts > 1 )) && flake_marker=true
else
  topology_parity_status="failed"
  topology_parity_attempts="$LAST_STAGE_ATTEMPTS"
  topology_parity_finished_at="$(now_utc)"
  fail_stage "topology_parity"
fi
topology_parity_finished_at="$(now_utc)"

runtime_utilization_status="running"
runtime_utilization_started_at="$(now_utc)"
if run_stage "Service audit: runtime utilization rollup" \
  node "$ROOT_DIR/scripts/build-service-utilization-report.mjs"; then
  runtime_utilization_status="passed"
  runtime_utilization_attempts="$LAST_STAGE_ATTEMPTS"
  (( runtime_utilization_attempts > 1 )) && flake_marker=true
else
  runtime_utilization_status="failed"
  runtime_utilization_attempts="$LAST_STAGE_ATTEMPTS"
  runtime_utilization_finished_at="$(now_utc)"
  fail_stage "runtime_utilization"
fi
runtime_utilization_finished_at="$(now_utc)"

threshold_evaluation_status="running"
threshold_evaluation_started_at="$(now_utc)"
if run_stage "Service audit: threshold evaluation" bash -lc "
  node \"$ROOT_DIR/scripts/check-active-route-to-service-coverage.mjs\" &&
  node \"$ROOT_DIR/scripts/check-service-necessity-thresholds.mjs\" &&
  node \"$ROOT_DIR/scripts/check-service-utilization-thresholds.mjs\"
"; then
  threshold_evaluation_status="passed"
  threshold_evaluation_attempts="$LAST_STAGE_ATTEMPTS"
  (( threshold_evaluation_attempts > 1 )) && flake_marker=true
else
  threshold_evaluation_status="failed"
  threshold_evaluation_attempts="$LAST_STAGE_ATTEMPTS"
  threshold_evaluation_finished_at="$(now_utc)"
  fail_stage "threshold_evaluation"
fi
threshold_evaluation_finished_at="$(now_utc)"

if (( RUN_BACKEND == 1 )); then
  backend_mesh_status="running"
  backend_mesh_started_at="$(now_utc)"
  if run_stage "Backend: mesh services test suite" npm run test:mesh-services; then
    backend_mesh_status="passed"
    backend_mesh_attempts="$LAST_STAGE_ATTEMPTS"
    (( backend_mesh_attempts > 1 )) && flake_marker=true
  else
    backend_mesh_status="failed"
    backend_mesh_attempts="$LAST_STAGE_ATTEMPTS"
    backend_mesh_finished_at="$(now_utc)"
    fail_stage "backend_mesh"
  fi
  backend_mesh_finished_at="$(now_utc)"

  backend_saas_status="running"
  backend_saas_started_at="$(now_utc)"
  if run_stage "Backend: saas services test suite" npm run test:saas-services; then
    backend_saas_status="passed"
    backend_saas_attempts="$LAST_STAGE_ATTEMPTS"
    (( backend_saas_attempts > 1 )) && flake_marker=true
  else
    backend_saas_status="failed"
    backend_saas_attempts="$LAST_STAGE_ATTEMPTS"
    backend_saas_finished_at="$(now_utc)"
    fail_stage "backend_saas"
  fi
  backend_saas_finished_at="$(now_utc)"

  backend_infra_status="running"
  backend_infra_started_at="$(now_utc)"
  if run_stage "Backend: infra scripts test suite" npm run test:infra-scripts; then
    backend_infra_status="passed"
    backend_infra_attempts="$LAST_STAGE_ATTEMPTS"
    (( backend_infra_attempts > 1 )) && flake_marker=true
  else
    backend_infra_status="failed"
    backend_infra_attempts="$LAST_STAGE_ATTEMPTS"
    backend_infra_finished_at="$(now_utc)"
    fail_stage "backend_infra"
  fi
  backend_infra_finished_at="$(now_utc)"

  backend_heavy_status="running"
  backend_heavy_started_at="$(now_utc)"
  if run_stage "Backend: explicit gateway heavy suites" env \
    NODE_ENV=test \
    MAPLE_LOG_LEVEL=error \
    MAPLE_LOG_REQUESTS=0 \
    MAPLE_LOG_INCLUDE_BODIES=0 \
    MAPLE_LOG_BODY_MAX_CHARS=4000 \
    MAPLE_FIREWALL_LOG_DIR=~/.maple/firewall-logs \
    node --test \
    "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/tests/e2e-app.test.mjs" \
    "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/tests/integration-load.test.mjs" \
    "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/tests/load-test.test.mjs"; then
    backend_heavy_status="passed"
    backend_heavy_attempts="$LAST_STAGE_ATTEMPTS"
    (( backend_heavy_attempts > 1 )) && flake_marker=true
  else
    backend_heavy_status="failed"
    backend_heavy_attempts="$LAST_STAGE_ATTEMPTS"
    backend_heavy_finished_at="$(now_utc)"
    fail_stage "backend_heavy"
  fi
  backend_heavy_finished_at="$(now_utc)"

  if (( RUN_LIVE == 1 )); then
    live_started_at="$(now_utc)"
    missing_live_env=()
    required_live_env=(
      "GOOGLE_CLIENT_ID"
      "STRIPE_SECRET_KEY"
      "STRIPE_PRICE_PRO"
      "STRIPE_PRICE_TEAM"
      "STRIPE_PRICE_ENTERPRISE"
      "OPENCLAW_BRIDGE_URL"
    )
    for key in "${required_live_env[@]}"; do
      value="${!key-}"
      if is_placeholder_secret "$value"; then
        missing_live_env+=("$key")
      fi
    done

    if (( ${#missing_live_env[@]} == 0 )); then
      live_status="running"
      rm -f "$LIVE_SKIP_FILE"
      if run_stage "Backend: live provider matrix (strict)" env MAPLE_LIVE_DEP_MATRIX_STRICT=1 npm run test:providers-live:matrix; then
        live_status="passed"
        live_attempts="$LAST_STAGE_ATTEMPTS"
        (( live_attempts > 1 )) && flake_marker=true
      else
        live_status="failed"
        live_attempts="$LAST_STAGE_ATTEMPTS"
        live_finished_at="$(now_utc)"
        fail_stage "live_provider_matrix"
      fi
    else
      if (( FORCE_LIVE == 1 )); then
        live_status="failed"
        write_live_skip_file "Missing required live-suite secrets while force-live is enabled." "${missing_live_env[@]}"
        live_finished_at="$(now_utc)"
        fail_stage "live_provider_matrix_force_live_missing_secrets"
      else
        live_status="skipped"
        write_live_skip_file "Missing required live-suite secrets." "${missing_live_env[@]}"
      fi
    fi
    live_finished_at="$(now_utc)"
  else
    live_status="skipped"
    live_started_at="$(now_utc)"
    write_live_skip_file "Live suite disabled by --no-live flag."
    live_finished_at="$(now_utc)"
  fi
fi

if (( RUN_BACKEND == 0 && RUN_LIVE == 1 )); then
  live_status="skipped"
  live_started_at="$(now_utc)"
  write_live_skip_file "Live suite skipped because backend scope is disabled."
  live_finished_at="$(now_utc)"
fi

frontend_b_surface_status="running"
frontend_b_surface_started_at="$(now_utc)"
if run_stage "Frontend B: orchestration surface guard" npm run check:frontendB:surface; then
  frontend_b_surface_status="passed"
  frontend_b_surface_attempts="$LAST_STAGE_ATTEMPTS"
  (( frontend_b_surface_attempts > 1 )) && flake_marker=true
else
  frontend_b_surface_status="failed"
  frontend_b_surface_attempts="$LAST_STAGE_ATTEMPTS"
  frontend_b_surface_finished_at="$(now_utc)"
  fail_stage "frontend_b_surface"
fi
frontend_b_surface_finished_at="$(now_utc)"

if (( RUN_FRONTEND == 1 )); then
  frontend_flow_status="running"
  frontend_flow_started_at="$(now_utc)"
  if run_stage "Frontend: flow CI suite" npm run test:frontend:flow:ci; then
    frontend_flow_status="passed"
    frontend_flow_attempts="$LAST_STAGE_ATTEMPTS"
    (( frontend_flow_attempts > 1 )) && flake_marker=true
  else
    frontend_flow_status="failed"
    frontend_flow_attempts="$LAST_STAGE_ATTEMPTS"
    frontend_flow_finished_at="$(now_utc)"
    fail_stage "frontend_flow"
  fi
  frontend_flow_finished_at="$(now_utc)"
fi

write_summary
printf '\n[full-matrix] Completed. Summary: %s\n' "$SUMMARY_FILE"
