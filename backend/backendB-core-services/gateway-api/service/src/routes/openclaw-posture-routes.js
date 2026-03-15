import { server, database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { authContextStorage } from "../auth-context.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { allowNoAuth, isProductionRuntime } from "../config.js";
import { mapleLog } from "../logging.js";

const app = server.app;

const BRIDGE_HOST = process.env.OPENCLAW_BRIDGE_HOST ?? "127.0.0.1";
const BRIDGE_REQUIRE_AUTH = process.env.OPENCLAW_BRIDGE_REQUIRE_AUTH ?? "1";
const GATEWAY_WS_URL = process.env.OPENCLAW_GATEWAY_WS_URL ?? "ws://127.0.0.1:19001";
const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL ?? "http://127.0.0.1:8787";

async function runPostureChecks() {
  const checks = [];
  const failures = [];

  // Check 1: Bridge auth enabled
  const authEnabled = String(BRIDGE_REQUIRE_AUTH) !== "0";
  checks.push({ id: "bridge_auth_enabled", severity: "critical", pass: authEnabled });
  if (!authEnabled) {
    failures.push({ id: "bridge_auth_enabled", severity: "critical", message: "Bridge auth is disabled (OPENCLAW_BRIDGE_REQUIRE_AUTH=0)" });
  }

  // Check 2: Bridge bound to loopback
  const isLoopback = BRIDGE_HOST === "127.0.0.1" || BRIDGE_HOST === "localhost" || BRIDGE_HOST === "::1";
  checks.push({ id: "bridge_loopback_only", severity: "high", pass: isLoopback });
  if (!isLoopback) {
    failures.push({ id: "bridge_loopback_only", severity: "high", message: `Bridge bound to ${BRIDGE_HOST} instead of loopback` });
  }

  // Check 3: Gateway TLS
  const tlsEnabled = GATEWAY_WS_URL.startsWith("wss://");
  checks.push({ id: "gateway_tls_enabled", severity: "high", pass: tlsEnabled });
  if (!tlsEnabled) {
    failures.push({ id: "gateway_tls_enabled", severity: "high", message: "Gateway WS URL does not use TLS (wss://)" });
  }

  // Check 4: Gateway auth enforcement — live check of runtime config
  const gatewayAuthEnforced = isProductionRuntime || !allowNoAuth;
  checks.push({ id: "gateway_auth_enforced", severity: "critical", pass: gatewayAuthEnforced });
  if (!gatewayAuthEnforced) {
    failures.push({ id: "gateway_auth_enforced", severity: "critical", message: "Gateway allows unauthenticated requests (allowNoAuth is enabled)" });
  }

  // Check 5: Bridge origin validation — verify the bridge rejects requests
  // without a valid origin. A non-5xx HEAD only proves reachability, not that
  // origin enforcement is active. We send a request with a spoofed origin and
  // verify the bridge rejects it (4xx expected for valid origin enforcement).
  let bridgeOriginValidated = false;
  let bridgeOriginNote = "live probe";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(BRIDGE_URL, {
      method: "HEAD",
      headers: { origin: "https://attacker.example.com" },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    if (resp === null) {
      bridgeOriginNote = "bridge unreachable";
    } else if (resp.status === 403 || resp.status === 401) {
      // Bridge correctly rejected the spoofed origin
      bridgeOriginValidated = true;
      bridgeOriginNote = `rejected spoofed origin with ${resp.status}`;
    } else {
      bridgeOriginNote = `responded ${resp.status} to spoofed origin — origin enforcement may not be active`;
    }
  } catch {
    bridgeOriginNote = "probe failed";
  }
  checks.push({ id: "bridge_origin_validated", severity: "high", pass: bridgeOriginValidated, note: bridgeOriginNote });
  if (!bridgeOriginValidated) {
    failures.push({ id: "bridge_origin_validated", severity: "high", message: `Bridge origin validation: ${bridgeOriginNote}` });
  }

  return { checks, failures };
}

// Require admin session auth — posture data is security-sensitive.
// Both API key and session auth are accepted, but session users must have
// an admin role (checked by requireApiKeyResponse which validates admin keys).
const adminAuthGate = async (c, next) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const ctx = authContextStorage.getStore();
  // Reject non-admin sessions: API key auth is already admin-gated by
  // requireApiKeyResponse; session users must explicitly have admin role.
  if (ctx?.method === "session" && ctx?.role !== "admin") {
    return c.json({ ok: false, error: "Posture endpoint requires admin role." }, 403);
  }
  await next();
};

app.use("/api/openclaw/posture", adminAuthGate);
app.use("/api/openclaw/posture/*", adminAuthGate);

app.get("/api/openclaw/posture", async (c) => {
  const { checks, failures } = await runPostureChecks();
  return c.json({
    ok: true,
    data: { checks, failures, scannedAt: new Date().toISOString() },
  });
});

app.post("/api/openclaw/posture/scan", async (c) => {
  const { checks, failures } = await runPostureChecks();

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_POSTURE_SCANNED",
    sourceService: "gateway-api",
    severity: failures.some((f) => f.severity === "critical") ? "RISK_SEVERITY_CRITICAL" : "RISK_SEVERITY_LOW",
    summary: `OpenClaw posture scan: ${failures.length} failure(s) of ${checks.length} checks`,
    payload: { checks, failures },
  });

  return c.json({
    ok: true,
    data: { checks, failures, scannedAt: new Date().toISOString() },
  });
});
