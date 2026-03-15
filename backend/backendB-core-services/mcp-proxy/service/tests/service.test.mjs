// Env setup before imports — required by @maple/common and config.js
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MCP_PROXY_PORT = process.env.MCP_PROXY_PORT || "9200";
process.env.MCP_PROXY_HOST = process.env.MCP_PROXY_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "none";
process.env.MAPLE_DOWNSTREAM_APPS = process.env.MAPLE_DOWNSTREAM_APPS || "none";
process.env.MAPLE_TOOL_RUNNER_MODE = process.env.MAPLE_TOOL_RUNNER_MODE || "service";
process.env.MAPLE_TOOL_RUNNER_IMAGE = process.env.MAPLE_TOOL_RUNNER_IMAGE || "tool-runner:latest";
process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE = process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE || "maple-tools";
process.env.NODE_ENV = "development";
process.env.MAPLE_CREDENTIAL_SIGNING_KEY = process.env.MAPLE_CREDENTIAL_SIGNING_KEY || "test-credential-signing-key-64chars-abcdef0123456789abcdef0123456789";

import assert from "node:assert/strict";
import test from "node:test";

const { DownstreamRegistry } = await import("../src/downstream-registry.js");
const { createMcpProxyService, closeMcpProxyClients } = await import(`../src/service.js?t=${Date.now()}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeApp(overrides = {}) {
  return {
    appId: "test-app",
    name: "Test App",
    url: "https://test.local/mcp",
    transport: "streamable-http",
    enabled: true,
    status: "connected",
    tools: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("createMcpProxyService: returns gRPC server with correct interface", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp());

  const server = createMcpProxyService(registry);
  assert.ok(server);
  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");
  server.forceShutdown();
});

test("DownstreamRegistry: list returns enabled apps only by default", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "enabled-1" }));
  registry.register(makeApp({ appId: "disabled-1", enabled: false, status: "disconnected" }));

  const enabledOnly = registry.list();
  assert.equal(enabledOnly.length, 1);
  assert.equal(enabledOnly[0].appId, "enabled-1");

  const allApps = registry.list(true);
  assert.equal(allApps.length, 2);
});

test("DownstreamRegistry: get returns app by ID", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "lookup-app" }));

  const app = registry.get("lookup-app");
  assert.ok(app);
  assert.equal(app.appId, "lookup-app");
  assert.equal(app.url, "https://test.local/mcp");

  const missing = registry.get("nonexistent");
  assert.equal(missing, undefined);
});

test("DownstreamRegistry: tools discovery and storage", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "tools-app" }));

  registry.setToolsForApp("tools-app", [
    { name: "web_search", description: "Search the web", inputSchema: { type: "object" } },
    { name: "calculator", description: "Compute math", inputSchema: { type: "object" } },
    { name: "", description: "invalid tool with empty name" },
  ]);

  const tools = registry.getToolsForApp("tools-app");
  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, "web_search");
  assert.equal(tools[1].name, "calculator");

  const allTools = registry.getAllTools();
  assert.equal(allTools.length, 2);
  assert.equal(allTools[0].appId, "tools-app");
});

test("PingDownstream: registry lookup for enabled app returns truthy", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "ping-test" }));

  const app = registry.get("ping-test");
  assert.ok(app);
  assert.equal(app.enabled, true);
});

test("DownstreamRegistry: disabled app not in default list", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "only-disabled", enabled: false, status: "disconnected" }));

  const enabledList = registry.list();
  assert.equal(enabledList.length, 0);

  const allList = registry.list(true);
  assert.equal(allList.length, 1);
  assert.equal(allList[0].appId, "only-disabled");
});

test("DownstreamRegistry: getAllTools excludes tools from disabled apps", () => {
  const registry = new DownstreamRegistry();
  registry.register(makeApp({ appId: "active", enabled: true }));
  registry.register(makeApp({ appId: "inactive", enabled: false }));

  registry.setToolsForApp("active", [
    { name: "active_tool", description: "from active app" },
  ]);
  registry.setToolsForApp("inactive", [
    { name: "inactive_tool", description: "from inactive app" },
  ]);

  const allTools = registry.getAllTools();
  assert.equal(allTools.length, 1);
  assert.equal(allTools[0].name, "active_tool");
  assert.equal(allTools[0].appId, "active");
});

test("closeMcpProxyClients: does not throw when no clients initialized", () => {
  assert.doesNotThrow(() => closeMcpProxyClients());
});
