import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_REPORT_JSON_FILE,
  ROOT_DIR,
  parseArgs,
  readJsonIfExists,
  resolvePolicyLevel,
} from "./service-audit-common.mjs";

function run() {
  const args = parseArgs();
  const policy = resolvePolicyLevel(
    args.get("policy") ?? process.env.SERVICE_AUDIT_POLICY ?? process.env.SERVICE_NECESSITY_POLICY,
    "advisory",
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
    if (Number(row.necessityScore ?? 0) < 70) {
      violations.push(
        `${row.service}: required service necessity ${row.necessityScore} < 70.`,
      );
    }
  }

  if (violations.length > 0) {
    process.stderr.write("[necessity-thresholds] violations found:\n");
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    if (policy === "required") {
      process.exit(1);
    }
  }

  process.stdout.write(
    `[necessity-thresholds] ${violations.length === 0 ? "ok" : "advisory violations"} (policy=${policy})\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}
