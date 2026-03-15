#!/usr/bin/env node

/**
 * OpenClaw Gateway Posture Validator
 *
 * Probes an OpenClaw gateway to verify security posture:
 * - Origin enforcement (rejects foreign Origin headers)
 * - Auth enforcement (rejects unauthenticated requests)
 * - Loopback binding (bridge bound to 127.0.0.1)
 * - TLS enforcement (gateway WS URL uses wss://)
 */

const DEFAULT_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL ?? "http://127.0.0.1:8787";
const GATEWAY_WS_URL = process.env.OPENCLAW_GATEWAY_WS_URL ?? "ws://127.0.0.1:19001";
const BRIDGE_HOST = process.env.OPENCLAW_BRIDGE_HOST ?? "127.0.0.1";

async function probeOriginEnforcement(bridgeUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(new URL("/health", bridgeUrl), {
      headers: { Origin: "http://evil.example.com" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.status === 403;
  } catch {
    return false;
  }
}

async function probeAuthEnforcement(bridgeUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(new URL("/sessions", bridgeUrl), {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.status === 401;
  } catch {
    return false;
  }
}

function checkLoopbackBinding() {
  return BRIDGE_HOST === "127.0.0.1" || BRIDGE_HOST === "localhost" || BRIDGE_HOST === "::1";
}

function checkTlsEnabled() {
  return GATEWAY_WS_URL.startsWith("wss://");
}

export async function validateGatewayPosture(bridgeUrl = DEFAULT_BRIDGE_URL) {
  const issues = [];

  const originEnforced = await probeOriginEnforcement(bridgeUrl);
  if (!originEnforced) {
    issues.push({ id: "bridge_origin_validated", severity: "high", message: "Bridge accepts requests with foreign Origin headers" });
  }

  const authEnabled = await probeAuthEnforcement(bridgeUrl);
  if (!authEnabled) {
    issues.push({ id: "bridge_auth_enabled", severity: "critical", message: "Bridge does not require authentication" });
  }

  const loopbackOnly = checkLoopbackBinding();
  if (!loopbackOnly) {
    issues.push({ id: "bridge_loopback_only", severity: "high", message: `Bridge bound to ${BRIDGE_HOST} instead of loopback` });
  }

  const tlsEnabled = checkTlsEnabled();
  if (!tlsEnabled) {
    issues.push({ id: "gateway_tls_enabled", severity: "high", message: "Gateway WS URL does not use TLS (wss://)" });
  }

  return {
    originEnforced,
    authEnabled,
    loopbackOnly,
    tlsEnabled,
    issues,
  };
}

// Allow direct execution for quick checks
if (process.argv[1] && process.argv[1].endsWith("openclaw-posture-validator.mjs")) {
  validateGatewayPosture().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.issues.length > 0) {
      process.exitCode = 1;
    }
  }).catch((err) => {
    console.error("Posture validation failed:", err.message);
    process.exitCode = 2;
  });
}
