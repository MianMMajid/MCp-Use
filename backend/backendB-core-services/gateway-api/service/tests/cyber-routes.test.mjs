import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
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
const {
  runOpenClawTurn,
  shutdownOpenClawRuntime,
} = await import("../src/core/openclaw-agent-runtime.js");
await import("../src/routes/cyber-routes.js");

const createdAt = new Date().toISOString();

database.pool = {
  query: async (sql) => {
    const statement = String(sql);
    if (statement.includes("COUNT(*)::int AS total FROM gateway_audit_outbox")) {
      return { rows: [{ total: 1 }] };
    }
    if (statement.includes("FROM gateway_audit_outbox")) {
      return {
        rows: [
          {
            outbox_id: "outbox-cyber-1",
            status: "delivered",
            created_at: createdAt,
            updated_at: createdAt,
            delivered_at: createdAt,
            attempts: 1,
            last_error: "",
            event_json: JSON.stringify({
              eventId: "event-cyber-1",
              eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
              timestamp: createdAt,
              sourceService: "cyber-proxy",
              payload: {
                url: "https://evil.test/sample.exe",
                reason: "Executable content detected",
                sessionId: "audit-session-1",
                traceId: "audit-trace-1",
                scan: {
                  provider: "local",
                  status: "completed",
                  verdict: "quarantined",
                  sha256: "abc123",
                  contentType: "application/octet-stream",
                  sizeBytes: 42,
                  reasons: ["Executable content detected"],
                  checkedAt: createdAt,
                  blocked: true,
                  quarantined: true,
                },
              },
              severity: "RISK_SEVERITY_HIGH",
              summary: "Download quarantined: executable content",
            }),
          },
        ],
      };
    }
    return { rows: [{ "?column?": 1 }] };
  },
};

test.after(async () => {
  await shutdownOpenClawRuntime();
});

test("GET /api/cyber/status exposes combined provider and scanning state", async () => {
  const response = await server.app.request("http://localhost/api/cyber/status");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.providers.cyberProxy.reachable, "boolean");
  assert.equal(typeof payload.scanning.provider, "string");
  assert.equal(typeof payload.recent.blockedCount, "number");
});

test("GET /api/cyber/events returns normalized cyber audit incidents", async () => {
  const response = await server.app.request("http://localhost/api/cyber/events?limit=10");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].sourceService, "cyber-proxy");
  assert.equal(payload.items[0].scan.quarantined, true);
});

test("GET /api/cyber/downloads returns artifact-backed scan records with filters", async () => {
  const binDir = mkdtempSync(join(tmpdir(), "maple-openclaw-bin-"));
  const scriptPath = join(binDir, "openclaw");
  writeFileSync(scriptPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 1.0.0"
  exit 0
fi
session="agent-dev-main"
prev=""
for arg in "$@"; do
  if [ "$prev" = "--session-id" ]; then
    session="$arg"
  fi
  prev="$arg"
done
printf '{"sessionId":"%s","response":{"text":"Scanned reply"},"usage":{"input_tokens":1,"output_tokens":1}}\\n' "$session"
`, "utf8");
  chmodSync(scriptPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath}`;

  try {
    const run = await runOpenClawTurn({
      mode: "local",
      devProfile: false,
      sessionId: "cyber-route-session",
      message: "return a scanned reply",
    });
    const response = await server.app.request(`http://localhost/api/cyber/downloads?source=artifact&runId=${encodeURIComponent(run.runId)}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.items.length > 0, true);
    assert.equal(payload.items[0].source, "artifact");
    assert.equal(payload.items[0].runId, run.runId);
    assert.equal(typeof payload.items[0].scan.sha256, "string");
  } finally {
    process.env.PATH = originalPath;
  }
});

