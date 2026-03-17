import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";

applyGatewayTestEnvDefaults({
  MAPLE_ALLOW_NO_AUTH: "1",
  MAPLE_SKIP_AUTH_BOOTSTRAP: "1",
  MAPLE_DISABLE_HITL_BROKER: "1",
  MAPLE_SESSION_POLL: "0",
});

const { server, database } = await import("../src/state.js");
const originalPool = database.pool;
database.pool = null;
const { registerFirewallFilesystemRoutes } = await import("../src/routes/firewall-filesystem-routes.js");
registerFirewallFilesystemRoutes();

test.after(async () => {
  database.pool = originalPool;
  if (originalPool && typeof originalPool.end === "function") {
    await originalPool.end().catch(() => {});
  }
});

test("POST /api/firewall/filesystem/preflight rejects protected path mutations", async () => {
  const response = await server.app.request("http://localhost/api/firewall/filesystem/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operations: [{ op: "delete", path: "/etc/passwd" }],
      workspaceRoot: process.cwd(),
      sourceSurface: "test",
    }),
  });
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.item.lane, "hard_deny");
});

test("filesystem mutation workflow supports preflight, decision, promote, and restore", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "maple-fs-guard-"));
  mkdirSync(join(workspaceRoot, "dist"), { recursive: true });
  writeFileSync(join(workspaceRoot, "dist", "bundle.js"), "console.log('bundle');", "utf8");

  const preflightResponse = await server.app.request("http://localhost/api/firewall/filesystem/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operations: [{ op: "delete", path: join(workspaceRoot, "dist", "bundle.js") }],
      workspaceRoot,
      sourceSurface: "test",
      taskText: "Delete generated bundle output",
    }),
  });
  assert.equal(preflightResponse.status, 201);
  const preflightPayload = await preflightResponse.json();
  const planId = preflightPayload.item.planId;
  assert.equal(preflightPayload.item.lane, "direct_allow");

  const decisionResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", reason: "Proceed" }),
  });
  assert.equal(decisionResponse.status, 200);

  const promoteResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Promote deletion" }),
  });
  assert.equal(promoteResponse.status, 200);
  assert.equal(existsSync(join(workspaceRoot, "dist", "bundle.js")), false);
  const promotePayload = await promoteResponse.json();
  assert.equal(promotePayload.item.status, "promoted");
  assert.equal(Array.isArray(promotePayload.item.promotion.archivedFiles), true);

  const restoreResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Undo deletion" }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal(readFileSync(join(workspaceRoot, "dist", "bundle.js"), "utf8"), "console.log('bundle');");
  const restorePayload = await restoreResponse.json();
  assert.equal(restorePayload.item.status, "restored");
});

test("filesystem mutation workflow requires forked promotion for user-authored deletes", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "maple-fs-fork-"));
  mkdirSync(join(workspaceRoot, "src"), { recursive: true });
  writeFileSync(join(workspaceRoot, "src", "index.js"), "export const value = 1;\n", "utf8");

  const preflightResponse = await server.app.request("http://localhost/api/firewall/filesystem/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operations: [{ op: "delete", path: join(workspaceRoot, "src", "index.js") }],
      workspaceRoot,
      sourceSurface: "test",
      taskText: "Delete a source file from the repo",
    }),
  });
  assert.equal(preflightResponse.status, 201);
  const preflightPayload = await preflightResponse.json();
  const planId = preflightPayload.item.planId;
  assert.equal(preflightPayload.item.lane, "fork_required");

  const decisionResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", reason: "Review complete" }),
  });
  assert.equal(decisionResponse.status, 200);

  const promoteResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Promote reviewed fork result" }),
  });
  assert.equal(promoteResponse.status, 200);
  const promotePayload = await promoteResponse.json();
  assert.equal(promotePayload.item.status, "promoted");
  assert.equal(promotePayload.item.validation.valid, true);
  assert.equal(typeof promotePayload.item.forkResult.forkRoot, "string");
  assert.equal(existsSync(join(workspaceRoot, "src", "index.js")), false);

  const restoreResponse = await server.app.request(`http://localhost/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Restore reviewed source file" }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal(readFileSync(join(workspaceRoot, "src", "index.js"), "utf8"), "export const value = 1;\n");
});
