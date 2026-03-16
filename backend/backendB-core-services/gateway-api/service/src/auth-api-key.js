import { createHash } from "node:crypto";
import { apiKeyAuthEnabled, allowNoAuth, configuredApiKeys, } from "./config.js";
import { extractApiKeyFromHeaders, verifyApiKey, } from "@maple/security";
import { authContextStorage } from "./auth-context.js";
import { findRequestSession } from "./auth-session.js";
import { apiErrorPayload } from "./api-error.js";

/**
 * Verify a generated API key (maple_user_* or maple_sa_*) against the
 * platform store's database. Returns the key record if valid, or null.
 */
async function verifyGeneratedApiKey(token, database) {
    if (!token || !database?.pool) return null;
    if (!token.startsWith("maple_user_") && !token.startsWith("maple_sa_")) return null;
    const hash = createHash("sha256").update(String(token)).digest("hex");
    try {
        const userResult = await database.pool.query(
            `SELECT key_id, user_id, name, expires_at FROM business_user_api_keys
             WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > $2) LIMIT 1`,
            [hash, new Date().toISOString()]
        );
        if (userResult.rows.length > 0) {
            return { type: "user", userId: userResult.rows[0].user_id, keyId: userResult.rows[0].key_id, role: "user" };
        }
        const saResult = await database.pool.query(
            `SELECT key_id, org_id, name, expires_at FROM business_service_account_keys
             WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > $2) LIMIT 1`,
            [hash, new Date().toISOString()]
        );
        if (saResult.rows.length > 0) {
            return { type: "service_account", orgId: saResult.rows[0].org_id, keyId: saResult.rows[0].key_id, role: "service_account" };
        }
    } catch {
        // Table may not exist yet
    }
    return null;
}
function effectiveAllowNoAuth() {
    return allowNoAuth && process.env.NODE_ENV !== "production";
}

/**
 * Set auth context on both the per-request Hono context (c.set) and
 * AsyncLocalStorage (enterWith, for backward compat). The Hono context
 * is authoritative — it cannot bleed between concurrent requests.
 */
function setAuthContext(c, ctx) {
    c.set("mapleAuthContext", ctx);
    authContextStorage.enterWith(ctx);
}

/**
 * Read auth context. Prefers Hono per-request context, falls back to
 * AsyncLocalStorage for callers that don't have access to `c`.
 */
export function getAuthContext(c) {
    if (c) {
        const fromHono = c.get("mapleAuthContext");
        if (fromHono) return fromHono;
    }
    return authContextStorage.getStore();
}

export function verifyIncomingApiKey(xApiKey, authorization) {
    if (!apiKeyAuthEnabled) {
        if (effectiveAllowNoAuth()) {
            return { ok: true };
        }
        return { ok: false, reason: "misconfigured" };
    }
    const fromHeaders = extractApiKeyFromHeaders(xApiKey, authorization);
    if (!fromHeaders && effectiveAllowNoAuth()) {
        return { ok: true };
    }
    return verifyApiKey(configuredApiKeys, fromHeaders);
}
export function isApiKeyPresent(xApiKey, authorization) {
    return Boolean(extractApiKeyFromHeaders(xApiKey, authorization));
}
export async function requireApiKeyResponse(c, database, options = {}) {
  const allowSessionAuth = options.allowSession ?? true;
  const requireApiKey = options.requireApiKey ?? false;
  const xApiKey = c.req.header("x-api-key");
  const authorization = c.req.header("authorization");
  const cookieHeader = c.req.header("cookie");
    const unauthorizedBody = (reason) => ({
        ...apiErrorPayload("UNAUTHORIZED", "Unauthorized"),
        reason,
        hint: "Provide x-api-key / Authorization bearer token or sign in via /login.",
    });
  if (!requireApiKey && allowSessionAuth) {
    const session = await findRequestSession(database, cookieHeader);
    if (session) {
      setAuthContext(c, {
        method: "session",
        keyFingerprint: undefined,
        userId: session.userId,
        username: session.user.username,
        role: session.user.role ?? "user",
        authBypass: false,
      });
      return undefined;
    }
  }
  const apiKeyResult = verifyIncomingApiKey(xApiKey, authorization);
  const apiKeyProvided = isApiKeyPresent(xApiKey, authorization);
  if (apiKeyResult.ok && (requireApiKey || apiKeyProvided || apiKeyAuthEnabled || effectiveAllowNoAuth())) {
    setAuthContext(c, {
      method: apiKeyAuthEnabled ? "api_key" : "bypass",
      keyFingerprint: apiKeyResult.keyFingerprint,
      role: apiKeyAuthEnabled && apiKeyProvided ? "admin" : "user",
      authBypass: !apiKeyAuthEnabled && effectiveAllowNoAuth(),
    });
    return undefined;
  }
  // Check platform-generated API keys (maple_user_*, maple_sa_*)
  if (apiKeyProvided && !apiKeyResult.ok) {
    const fromHeaders = extractApiKeyFromHeaders(xApiKey, authorization);
    const generated = await verifyGeneratedApiKey(fromHeaders, database);
    if (generated) {
      setAuthContext(c, {
        method: "generated_api_key",
        keyFingerprint: generated.keyId,
        userId: generated.userId,
        role: generated.role,
        authBypass: false,
      });
      return undefined;
    }
  }
    if (requireApiKey) {
        return c.json(unauthorizedBody(apiKeyResult.reason ?? "missing_key"), 401);
    }
    if (effectiveAllowNoAuth()) {
        setAuthContext(c, {
            method: "bypass",
            authBypass: true,
        });
        return undefined;
    }
    const reason = apiKeyResult.reason ?? "unauthorized";
    return c.json(unauthorizedBody(reason), 401);
}
//# sourceMappingURL=auth-api-key.js.map
