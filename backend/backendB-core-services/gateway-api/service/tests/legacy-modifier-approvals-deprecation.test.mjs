import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

const modifierRoutesPath = resolve(
  repoRoot,
  "backend/backendB-core-services/gateway-api/service/src/routes/openclaw-modifier-routes.js",
);
const approvalWatchPath = resolve(
  repoRoot,
  "backend/backendB-core-services/gateway-api/service/src/routes/modifier-approval-watch.js",
);

test("legacy modifier approval endpoints are explicitly marked Endpoint removed (410)", () => {
  const modifierRoutes = readFileSync(modifierRoutesPath, "utf8");
  const approvalWatchRoutes = readFileSync(approvalWatchPath, "utf8");

  assert.match(modifierRoutes, /Endpoint removed/);
  assert.match(modifierRoutes, /\/api\/openclaw\/modifier\/approvals/);
  assert.match(modifierRoutes, /server\.app\.get\(LEGACY_APPROVALS_BASE/);
  assert.match(modifierRoutes, /server\.app\.post\(`\$\{LEGACY_APPROVALS_BASE\}\/:approvalId\/decision`/);
  assert.match(modifierRoutes, /server\.app\.post\(`\$\{LEGACY_APPROVALS_BASE\}\/step-up-decide`/);

  assert.match(approvalWatchRoutes, /Endpoint removed/);
  assert.match(approvalWatchRoutes, /\/api\/openclaw\/modifier\/approvals\/watch/);
  assert.match(approvalWatchRoutes, /server\.app\.get\(LEGACY_APPROVAL_STREAM_PATH/);
});
