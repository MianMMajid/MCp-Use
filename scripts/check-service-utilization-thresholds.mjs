import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_REPORT_JSON_FILE,
  ROOT_DIR,
  parseArgs,
  readJsonIfExists,
  resolvePolicyLevel,
} from "./service-audit-common.mjs";

function asBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function run() {
  const args = parseArgs();
  const policy = resolvePolicyLevel(
    args.get("policy") ?? process.env.SERVICE_AUDIT_POLICY ?? process.env.SERVICE_UTILIZATION_POLICY,
    "advisory",
  );
  const runtimeRequired = asBoolean(
    args.get("runtime-required") ?? process.env.SERVICE_UTILIZATION_RUNTIME_REQUIRED,
    false,
  );
  const reportFile = resolve(ROOT_DIR, args.get("report") ?? DEFAULT_REPORT_JSON_FILE);
  const report = readJsonIfExists(reportFile, null);
  if (!report) {
    throw new Error(`Utilization report not found: ${reportFile}`);
  }

  const violations = [];
  for (const row of report.services ?? []) {
    if (!row?.required) continue;
    if (row.retired === true || String(row.lifecycle ?? "").toLowerCase() === "retired") continue;
    const utilization = Number(row.utilizationScore ?? 0);
    const runtimeCalls = Number(row?.evidence?.runtimeCalls14d ?? 0);
    const runtimeSource = String(row.runtimeEvidenceSource ?? "gateway");
    if (utilization < 60) {
      violations.push(`${row.service}: required service utilization ${utilization} < 60.`);
    }
    if (runtimeRequired && runtimeSource !== "external" && runtimeCalls <= 0) {
      violations.push(
        `${row.service}: required service has zero runtime invocation evidence in window.`,
      );
    }
  }

  if (violations.length > 0) {
    process.stderr.write("[utilization-thresholds] violations found:\n");
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    if (policy === "required") {
      process.exit(1);
    }
  }

  process.stdout.write(
    `[utilization-thresholds] ${violations.length === 0 ? "ok" : "advisory violations"} (policy=${policy}, runtimeRequired=${runtimeRequired})\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}
