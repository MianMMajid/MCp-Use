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

test("maple auth forgot-password help exposes redirect-url", () => {
  const result = runCli(["auth", "forgot-password", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--redirect-url <url>/);
});

test("maple auth sso-discover and mfa-challenge help expose frontend auth flow fields", () => {
  const sso = runCli(["auth", "sso-discover", "--help"]);
  assert.equal(sso.status, 0, sso.stderr);
  assert.match(sso.stdout, /--email <email>/);

  const mfa = runCli(["auth", "mfa-challenge", "--help"]);
  assert.equal(mfa.status, 0, mfa.stderr);
  assert.match(mfa.stdout, /--mfa-session-token <token>/);
  assert.match(mfa.stdout, /--code <code>/);
  assert.match(mfa.stdout, /--recovery-code <code>/);
  assert.match(mfa.stdout, /--trust-device <true\|false>/);
});

test("maple agents run help exposes prompt alias", () => {
  const result = runCli(["agents", "run", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--prompt <text>/);
});

test("maple firewalls upload-file-entry help exposes file path", () => {
  const result = runCli(["firewalls", "upload-file-entry", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--file <path>/);
});

test("maple firewall chat help exposes frontend A context options", () => {
  const result = runCli(["firewall", "chat", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--trace-id <id>/);
  assert.match(result.stdout, /--session-id <id>/);
  assert.match(result.stdout, /--include-context/);
});

test("maple firewall filesystem-preflight help exposes mutation planning fields", () => {
  const result = runCli(["firewall", "filesystem-preflight", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--operations-json <json>/);
  assert.match(result.stdout, /--workspace-root <path>/);
  assert.match(result.stdout, /--tool-name <name>/);
});

test("maple firewall filesystem-decision help exposes step-up aware review fields", () => {
  const result = runCli(["firewall", "filesystem-decision", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--action <approve\|deny>/);
  assert.match(result.stdout, /--reason <text>/);
  assert.match(result.stdout, /--challenge-token <token>/);
});

test("maple firewall filesystem-promote and restore help expose promotion workflow fields", () => {
  const promote = runCli(["firewall", "filesystem-promote", "--help"]);
  assert.equal(promote.status, 0, promote.stderr);
  assert.match(promote.stdout, /--reason <text>/);
  assert.match(promote.stdout, /--challenge-token <token>/);

  const restore = runCli(["firewall", "filesystem-restore", "--help"]);
  assert.equal(restore.status, 0, restore.stderr);
  assert.match(restore.stdout, /--reason <text>/);
  assert.match(restore.stdout, /--challenge-token <token>/);
});

test("maple admin decide-approval help exposes frontend A decision fields", () => {
  const result = runCli(["admin", "decide-approval", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--trace-id <traceId>/);
  assert.match(result.stdout, /--step-index <n>/);
  assert.match(result.stdout, /--action <action>/);
  assert.match(result.stdout, /--reason <reason>/);
});

test("maple observability retention help exposes retention-days", () => {
  const result = runCli(["observability", "set-retention", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--retention-days <days>/);
});

test("maple cyber downloads help exposes scan filters", () => {
  const result = runCli(["cyber", "downloads", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--verdict <verdict>/);
  assert.match(result.stdout, /--provider <provider>/);
  assert.match(result.stdout, /--run-id <id>/);
});

test("maple cyber incident-state help exposes step-up aware mutation fields", () => {
  const result = runCli(["cyber", "incident-state", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--state <state>/);
  assert.match(result.stdout, /--disposition <text>/);
  assert.match(result.stdout, /--challenge-token <token>/);
});

test("maple cyber suppression-create help exposes suppression workflow fields", () => {
  const result = runCli(["cyber", "suppression-create", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--scope-type <type>/);
  assert.match(result.stdout, /--scope-value <value>/);
  assert.match(result.stdout, /--rollback-path <text>/);
  assert.match(result.stdout, /--challenge-token <token>/);
});

test("maple skills marketplace commands expose marketplace discovery and install fields", () => {
  const browse = runCli(["skills", "marketplace", "--help"]);
  assert.equal(browse.status, 0, browse.stderr);
  assert.match(browse.stdout, /--q <text>/);
  assert.match(browse.stdout, /--transport <type>/);

  const install = runCli(["skills", "marketplace-install", "--help"]);
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /--name <name>/);
  assert.match(install.stdout, /--api-key <key>/);
  assert.match(install.stdout, /--registry-header <key=value>/);
});

test("maple orchestrations review-break-glass help matches backend review contract", () => {
  const result = runCli(["orchestrations", "review-break-glass", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--approved <true\|false>/);
  assert.match(result.stdout, /--notes <notes>/);
  assert.doesNotMatch(result.stdout, /--decision <decision>/);
  assert.doesNotMatch(result.stdout, /--reason <reason>/);
});

test("maple frontend b create commands are available", () => {
  const agents = runCli(["agents", "create", "--help"]);
  assert.equal(agents.status, 0, agents.stderr);
  assert.match(agents.stdout, /Create an agent definition/);

  const orchestrations = runCli(["orchestrations", "create", "--help"]);
  assert.equal(orchestrations.status, 0, orchestrations.stderr);
  assert.match(orchestrations.stdout, /Create an orchestration/);
});
