import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";

import { registerMcpTransportRoutes } from "../src/server/routes/mcp-transport-routes.js";

test("mcp transport middleware converts accidental HTML mcp GET responses to JSON-RPC error", async () => {
  const app = new Hono();

  registerMcpTransportRoutes(app as any, {
    allowNoAuth: true,
    handleMcpFirewallProxy: async () => undefined,
    requireApiKeyResponse: () => undefined,
  });

  app.get("/mcp", (c) => {
    const acceptHeader = c.req.header("accept") ?? "";
    return c.body(`<html>${acceptHeader}</html>`, 200, {
      "content-type": "text/html; charset=utf-8",
    });
  });

  const response = await app.request("http://localhost/mcp");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("content-type"), "application/json");
  const body = (await response.json()) as {
    error?: { message?: string };
  };
  assert.equal(body.error?.message, "Bad Request: Server not initialized");
});

test("mcp transport middleware forwards POST /mcp through proxy handler", async () => {
  const app = new Hono();
  let proxyCalled = false;

  registerMcpTransportRoutes(app as any, {
    allowNoAuth: true,
    handleMcpFirewallProxy: async () => {
      proxyCalled = true;
      return new Response(JSON.stringify({ ok: true, mode: "proxied" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    requireApiKeyResponse: () => undefined,
  });

  app.post("/mcp", () => new Response("should-not-hit", { status: 500 }));

  const response = await app.request("http://localhost/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(proxyCalled, true);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok?: boolean; mode?: string };
  assert.equal(body.ok, true);
  assert.equal(body.mode, "proxied");
});

test("mcp transport middleware enforces auth on /sse when allowNoAuth=false", async () => {
  const app = new Hono();

  registerMcpTransportRoutes(app as any, {
    allowNoAuth: false,
    handleMcpFirewallProxy: async () => undefined,
    requireApiKeyResponse: () => new Response("unauthorized", { status: 401 }),
  });

  app.get("/sse", () => new Response("stream"));

  const response = await app.request("http://localhost/sse");
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body, "unauthorized");
});
