import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = resolve(import.meta.dirname, "../../..");
const VALIDATION_SCRIPT = resolve(ROOT_DIR, "scripts/run-k8s-validation.sh");
const SUMMARY_FILE = resolve(ROOT_DIR, "artifacts/matrix/k8s-validation-summary.json");

test("k8s validation summary is always valid JSON with serialized k8sUpArgs", () => {
  const run = spawnSync(
    "bash",
    [VALIDATION_SCRIPT, "--skip-up", "--skip-port-forward"],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        MAPLE_K8S_NAMESPACE: "maple-test",
      },
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  // Expected in this unit context without a running K8s stack.
  assert.notEqual(run.status, 0);

  const parsed = JSON.parse(readFileSync(SUMMARY_FILE, "utf8"));
  assert.equal(parsed.artifactSchemaVersion, 2);
  assert.equal(typeof parsed.generatedAt, "string");
  assert.equal(Array.isArray(parsed.k8sUpArgs), true);
  assert.deepEqual(parsed.k8sUpArgs, ["--skip-build", "--skip-load", "--skip-restart"]);
});
