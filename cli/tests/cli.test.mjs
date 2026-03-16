import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = process.cwd();
const cliPath = resolve(repoRoot, "cli/index.js");

function runCli(args, extraEnv = {}) {
  const home = mkdtempSync(resolve(tmpdir(), "maple-cli-test-"));
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      MAPLE_GATEWAY_ORIGIN: "http://127.0.0.1:3000",
      MAPLE_ADMIN_CONSOLE_ORIGIN: "https://127.0.0.1:9443",
      ...extraEnv,
    },
  });
}

test("maple config profiles returns parseable JSON", () => {
  const result = runCli(["config", "profiles", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.data), true);
  assert.equal(payload.data.some((entry) => entry.name === "default"), true);
});

test("maple auth login help exposes the session login command", () => {
  const result = runCli(["auth", "login", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Login with username\/email and password/);
  assert.match(result.stdout, /--username <username>/);
  assert.match(result.stdout, /--password <password>/);
});
