import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_CALLGRAPH_FILE,
  ROOT_DIR,
  parseArgs,
  readJsonIfExists,
  readServiceCatalog,
  resolvePolicyLevel,
} from "./service-audit-common.mjs";

function run() {
  const args = parseArgs();
  const policy = resolvePolicyLevel(args.get("policy") ?? process.env.SERVICE_AUDIT_POLICY, "advisory");
  const callgraphFile = resolve(ROOT_DIR, args.get("callgraph") ?? DEFAULT_CALLGRAPH_FILE);
  const callgraph = readJsonIfExists(callgraphFile, null);
  if (!callgraph) {
    throw new Error(`Callgraph artifact not found: ${callgraphFile}`);
  }
  const coverage = new Map(
    (Array.isArray(callgraph.serviceCoverage) ? callgraph.serviceCoverage : []).map((entry) => [
      entry.service,
      entry,
    ]),
  );
  const catalog = readServiceCatalog(args.get("catalog"));

  const violations = [];
  for (const row of catalog.services) {
    if (!row?.service || row.required !== true) continue;
    if (String(row.lifecycle ?? "active").toLowerCase() === "retired") continue;
    if (row.requiresActiveRouteCoverage === false) continue;
    const current = coverage.get(row.service);
    const routeCount = Number(current?.routeCount ?? 0);
    if (routeCount <= 0) {
      violations.push(
        `${row.service}: required service has zero active route coverage in static callgraph.`,
      );
    }
  }

  const activeEntries = Array.isArray(callgraph.activeRouteEntryFiles)
    ? callgraph.activeRouteEntryFiles
    : [];
  if (activeEntries.some((entry) => String(entry).endsWith("/routes/firewall.js"))) {
    violations.push("Legacy route file routes/firewall.js is unexpectedly active.");
  }

  if (violations.length > 0) {
    process.stderr.write("[active-route-coverage] violations found:\n");
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    if (policy === "required") {
      process.exit(1);
    }
  }

  process.stdout.write(
    `[active-route-coverage] ${violations.length === 0 ? "ok" : "advisory violations"} (policy=${policy})\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}
