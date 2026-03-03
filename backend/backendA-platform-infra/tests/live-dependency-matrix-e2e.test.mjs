import assert from "node:assert/strict";
import test from "node:test";

const LIVE_MATRIX_ENABLED =
  String(process.env.MAPLE_LIVE_DEP_MATRIX_E2E ?? "0").trim() === "1";
const LIVE_MATRIX_INSECURE_TLS =
  String(process.env.MAPLE_LIVE_DEP_MATRIX_INSECURE_TLS ?? "0").trim() === "1";
const LOCAL_GATEWAY_URL_DEFAULT = "http://127.0.0.1:3000";

if (LIVE_MATRIX_INSECURE_TLS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function runLiveTest(name, fn) {
  if (!LIVE_MATRIX_ENABLED) {
    test(
      name,
      {
        skip: "Set MAPLE_LIVE_DEP_MATRIX_E2E=1 to run live dependency matrix e2e checks.",
      },
      fn
    );
    return;
  }
  test(name, fn);
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function optionalEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  return value || "";
}

function normalizeBaseUrl(rawValue) {
  return String(rawValue ?? "").trim().replace(/\/+$/g, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { response, payload, text };
}

function connectionErrorMessage(error) {
  if (!error) return "unknown connection error";
  return error instanceof Error ? error.message : String(error);
}

function resolveGatewayUrl() {
  return firstEnv([
    "MAPLE_LIVE_GATEWAY_URL",
    "MCP_URL",
    "MAPLE_GATEWAY_URL",
  ]) || LOCAL_GATEWAY_URL_DEFAULT;
}

function resolveBusinessUrl() {
  return firstEnv([
    "MAPLE_LIVE_BUSINESS_URL",
    "MAPLE_BUSINESS_API_BASE_URL",
  ]);
}

runLiveTest("live dependency matrix: gateway runtime endpoints are healthy", async (t) => {
  const gatewayUrlRaw = resolveGatewayUrl();
  const gatewayUrl = normalizeBaseUrl(gatewayUrlRaw);

  let capabilities;
  try {
    capabilities = await fetchJson(`${gatewayUrl}/api/runtime/feature-capabilities`, {
      headers: {
        accept: "application/json",
      },
    });
  } catch (error) {
    t.skip(
      `Gateway live endpoint unreachable (${gatewayUrl}): ${connectionErrorMessage(error)}`
    );
    return;
  }
  assert.equal(capabilities.response.status, 200);
  assert.equal(capabilities.payload.ok, true);
  assert.equal(typeof capabilities.payload.features, "object");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      capabilities.payload.features || {},
      "openclawAgent"
    ),
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      capabilities.payload.features || {},
      "integrations"
    ),
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      capabilities.payload.features || {},
      "billing"
    ),
    true
  );

  const dependencies = await fetchJson(`${gatewayUrl}/api/runtime/dependencies`, {
    headers: {
      accept: "application/json",
    },
  });
  assert.equal(dependencies.response.status, 200);
  assert.equal(Array.isArray(dependencies.payload.checks), true);

  const chatCapabilities = await fetchJson(`${gatewayUrl}/api/chat/capabilities`, {
    headers: {
      accept: "application/json",
    },
  });
  assert.equal(chatCapabilities.response.status, 200);
  assert.equal(
    ["openclaw-agent", "context-wall-local-provider", "unavailable"].includes(
      String(chatCapabilities.payload.mode)
    ),
    true
  );
});

runLiveTest(
  "live dependency matrix: business readiness and optional authenticated surfaces",
  async (t) => {
    const gatewayUrlRaw = resolveGatewayUrl();
    const businessUrlRaw = resolveBusinessUrl();
    const businessUrl = businessUrlRaw ? normalizeBaseUrl(businessUrlRaw) : "";
    const gatewayUrl = normalizeBaseUrl(gatewayUrlRaw);
    const sessionCookie = optionalEnv("MAPLE_LIVE_SESSION_COOKIE");

    if (businessUrl) {
      let ready;
      try {
        ready = await fetchJson(`${businessUrl}/ready`, {
          headers: { accept: "application/json" },
        });
      } catch (error) {
        t.diagnostic(
          `Business live endpoint unreachable (${businessUrl}): ${connectionErrorMessage(error)}`
        );
        ready = null;
      }
      if (ready) {
        assert.equal([200, 503].includes(ready.response.status), true);
        assert.equal(typeof ready.payload.ready, "boolean");
      }

      const health = await fetchJson(`${businessUrl}/health`, {
        headers: { accept: "application/json" },
      }).catch((error) => {
        t.diagnostic(
          `Business health endpoint unreachable (${businessUrl}): ${connectionErrorMessage(error)}`
        );
        return null;
      });
      if (health) {
        assert.equal(health.response.status, 200);
        assert.equal(health.payload.status, "ok");
      }
    } else {
      t.diagnostic(
        "No business URL configured. Set MAPLE_LIVE_BUSINESS_URL for direct business readiness checks."
      );
    }

    const headers = {
      accept: "application/json",
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
    };
    const checks = [
      { id: "integrations", path: "/api/integrations" },
      { id: "openclaw_status", path: "/api/openclaw/agent/status" },
      { id: "hitl_approvals", path: "/api/hitl/approvals" },
      { id: "billing_subscription", path: "/api/billing/subscription" },
    ];
    for (const check of checks) {
      let result;
      try {
        result = await fetchJson(`${gatewayUrl}${check.path}`, { headers });
      } catch (error) {
        t.skip(
          `Gateway live endpoint unreachable (${gatewayUrl}): ${connectionErrorMessage(error)}`
        );
        return;
      }
      if (!sessionCookie && result.response.status === 401) {
        continue;
      }
      assert.equal(
        [200, 401, 403, 503].includes(result.response.status),
        true,
        `${check.id} returned unsupported status ${result.response.status}`
      );
    }
  }
);
