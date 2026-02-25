import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";

import {
  applyBusinessApiProxyHeaders,
  isBusinessApiProxyConfigured,
  proxyBusinessApiRequest,
} from "../src/core/business-api-client.js";

function fakeContext(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return {
    req: {
      header(name) {
        return normalized[name.toLowerCase()];
      },
    },
  };
}

function startTestServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const info = server.address();
      if (!info || typeof info === "string") {
        reject(new Error("Unable to resolve test server address"));
        return;
      }
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${info.port}`,
      });
    });
  });
}

test("business-api proxy reports disabled when base URL is missing", async () => {
  assert.equal(isBusinessApiProxyConfigured(undefined), false);

  const proxied = await proxyBusinessApiRequest(fakeContext(), "/api/business/user/profile", {
    baseUrl: "",
  });

  assert.equal(proxied.proxied, false);
  assert.equal(proxied.reason, "not_configured");
});

test("business-api proxy forwards JSON responses with status", async () => {
  const { server, baseUrl } = await startTestServer((req, res) => {
    assert.equal(req.url, "/api/business/user/profile");
    assert.equal(req.headers["x-maple-source-service"], "gateway-api");
    assert.equal(req.headers.cookie, "maple_session=session-123");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, source: "backendC" }));
  });

  try {
    const proxied = await proxyBusinessApiRequest(
      fakeContext({ cookie: "maple_session=session-123" }),
      "/api/business/user/profile",
      { baseUrl }
    );

    assert.equal(proxied.proxied, true);
    assert.equal(proxied.status, 200);
    assert.deepEqual(proxied.payload, { ok: true, source: "backendC" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("business-api proxy handles POST body forwarding", async () => {
  const { server, baseUrl } = await startTestServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      assert.equal(req.method, "POST");
      const parsed = JSON.parse(body);
      assert.equal(parsed.currentPassword, "old-password");
      assert.equal(parsed.newPassword, "new-password-123");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });

  try {
    const proxied = await proxyBusinessApiRequest(
      fakeContext({ cookie: "maple_session=session-123" }),
      "/api/business/user/change-password",
      {
        method: "POST",
        baseUrl,
        body: {
          currentPassword: "old-password",
          newPassword: "new-password-123",
        },
      }
    );

    assert.equal(proxied.proxied, true);
    assert.equal(proxied.status, 200);
    assert.deepEqual(proxied.payload, { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("business-api proxy normalizes legacy context headers to x-maple-*", async () => {
  const { server, baseUrl } = await startTestServer((req, res) => {
    assert.equal(req.headers["x-maple-tenant-id"], "tenant-1");
    assert.equal(req.headers["x-maple-user-id"], "user-1");
    assert.equal(req.headers["x-maple-device-id"], "device-1");
    assert.equal(req.headers["x-maple-session-id"], "session-1");
    assert.equal(req.headers["x-trace-id"], "trace-1");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });

  try {
    const proxied = await proxyBusinessApiRequest(
      fakeContext({
        "x-tenant-id": "tenant-1",
        "x-user-id": "user-1",
        "x-device-id": "device-1",
        "mcp-session-id": "session-1",
        "x-trace-id": "trace-1",
      }),
      "/api/business/org",
      { baseUrl }
    );

    assert.equal(proxied.proxied, true);
    assert.equal(proxied.status, 200);
    assert.deepEqual(proxied.payload, { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("business-api proxy captures set-cookie headers from upstream", async () => {
  const { server, baseUrl } = await startTestServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("set-cookie", [
      "maple_session=session-1; Path=/; HttpOnly",
      "maple_scope=user:1; Path=/; HttpOnly",
    ]);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });

  try {
    const proxied = await proxyBusinessApiRequest(
      fakeContext({ cookie: "maple_session=session-123" }),
      "/api/business/auth/login",
      {
        method: "POST",
        baseUrl,
        body: { username: "maple", password: "password" },
      }
    );

    assert.equal(proxied.proxied, true);
    assert.equal(Array.isArray(proxied.headers.setCookie), true);
    assert.equal(proxied.headers.setCookie.length, 2);
    assert.equal(
      proxied.headers.setCookie[0],
      "maple_session=session-1; Path=/; HttpOnly"
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("applyBusinessApiProxyHeaders appends set-cookie headers to Hono context", () => {
  const writes = [];
  const context = {
    header(name, value, options) {
      writes.push({ name: String(name), value: String(value), options });
    },
  };

  applyBusinessApiProxyHeaders(context, {
    headers: {
      setCookie: [
        "maple_session=session-2; Path=/; HttpOnly",
        "maple_scope=user:2; Path=/; HttpOnly",
      ],
    },
  });

  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], {
    name: "set-cookie",
    value: "maple_session=session-2; Path=/; HttpOnly",
    options: { append: true },
  });
  assert.deepEqual(writes[1], {
    name: "set-cookie",
    value: "maple_scope=user:2; Path=/; HttpOnly",
    options: { append: true },
  });
});
