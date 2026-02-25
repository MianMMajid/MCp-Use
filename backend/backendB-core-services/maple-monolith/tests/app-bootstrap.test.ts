import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("app bootstrap mounts firewall-chat and demo route groups", async () => {
  const envBackup = {
    MAPLE_DISABLE_AUTOSTART: process.env.MAPLE_DISABLE_AUTOSTART,
    MAPLE_ALLOW_NO_AUTH: process.env.MAPLE_ALLOW_NO_AUTH,
    MAPLE_ENABLE_DEMO_ROUTES: process.env.MAPLE_ENABLE_DEMO_ROUTES,
    MAPLE_DOWNSTREAM_APPS: process.env.MAPLE_DOWNSTREAM_APPS,
    MAPLE_DB_PATH: process.env.MAPLE_DB_PATH,
  };

  process.env.MAPLE_DISABLE_AUTOSTART = "1";
  process.env.MAPLE_ALLOW_NO_AUTH = "true";
  process.env.MAPLE_ENABLE_DEMO_ROUTES = "1";
  process.env.MAPLE_DOWNSTREAM_APPS = JSON.stringify([
    {
      id: "test-app",
      name: "Test App",
      mcpUrl: "https://example.com",
      tools: [{ name: "web_search", description: "Search tool", inputSchema: { type: "object" } }],
    },
  ]);
  process.env.MAPLE_DB_PATH = join(tmpdir(), `maple-bootstrap-${randomUUID()}.db`);

  try {
    const { server } = await import("../src/server/app.js");

    const demoSessions = await server.app.request("http://localhost/api/demo/sessions");
    assert.equal(demoSessions.status, 200);

    const firewallState = await server.app.request("http://localhost/api/firewall/state");
    assert.equal(firewallState.status, 200);

    const chatCapabilities = await server.app.request("http://localhost/api/chat/capabilities");
    assert.equal(chatCapabilities.status, 200);
  } finally {
    if (envBackup.MAPLE_DISABLE_AUTOSTART === undefined) {
      delete process.env.MAPLE_DISABLE_AUTOSTART;
    } else {
      process.env.MAPLE_DISABLE_AUTOSTART = envBackup.MAPLE_DISABLE_AUTOSTART;
    }
    if (envBackup.MAPLE_ALLOW_NO_AUTH === undefined) {
      delete process.env.MAPLE_ALLOW_NO_AUTH;
    } else {
      process.env.MAPLE_ALLOW_NO_AUTH = envBackup.MAPLE_ALLOW_NO_AUTH;
    }
    if (envBackup.MAPLE_ENABLE_DEMO_ROUTES === undefined) {
      delete process.env.MAPLE_ENABLE_DEMO_ROUTES;
    } else {
      process.env.MAPLE_ENABLE_DEMO_ROUTES = envBackup.MAPLE_ENABLE_DEMO_ROUTES;
    }
    if (envBackup.MAPLE_DOWNSTREAM_APPS === undefined) {
      delete process.env.MAPLE_DOWNSTREAM_APPS;
    } else {
      process.env.MAPLE_DOWNSTREAM_APPS = envBackup.MAPLE_DOWNSTREAM_APPS;
    }
    if (envBackup.MAPLE_DB_PATH === undefined) {
      delete process.env.MAPLE_DB_PATH;
    } else {
      process.env.MAPLE_DB_PATH = envBackup.MAPLE_DB_PATH;
    }
  }
});
