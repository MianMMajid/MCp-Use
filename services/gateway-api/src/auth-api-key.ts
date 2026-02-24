import {
  apiKeyAuthEnabled,
  allowNoAuth,
  configuredApiKeys,
} from "./config.js";
import {
  extractApiKeyFromHeaders,
  verifyApiKey,
} from "@maple/security";
import type { MaplePostgresDatabase } from "@maple/persistence";
import { authContextStorage } from "./auth-context.js";
import { findRequestSession } from "./auth-session.js";

export function verifyIncomingApiKey(xApiKey?: string, authorization?: string) {
  if (!apiKeyAuthEnabled) {
    if (allowNoAuth) {
      return { ok: true as const };
    }
    return {
      ok: false as const,
      reason: "misconfigured" as const,
    };
  }

  const fromHeaders = extractApiKeyFromHeaders(xApiKey, authorization);

  if (!fromHeaders && allowNoAuth) {
    return { ok: true as const };
  }

  const result = verifyApiKey(configuredApiKeys, fromHeaders);
  if (!result.ok) {
    return result;
  }

  return result;
}

export function isApiKeyPresent(xApiKey?: string, authorization?: string): boolean {
  return Boolean(extractApiKeyFromHeaders(xApiKey, authorization));
}

export interface RequireAuthOptions {
  allowSession?: boolean;
  requireApiKey?: boolean;
}

export async function requireApiKeyResponse(
  c: {
    req: {
      header: (name: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
  },
  database: MaplePostgresDatabase,
  options: RequireAuthOptions = {},
) {
  const allowSessionAuth = options.allowSession ?? true;
  const requireApiKey = options.requireApiKey ?? false;
  const xApiKey = c.req.header("x-api-key");
  const authorization = c.req.header("authorization");
  const cookieHeader = c.req.header("cookie");
  const unauthorizedBody = (reason: string) => ({
    error: "Unauthorized",
    reason,
    hint: "Provide x-api-key / Authorization bearer token or sign in via /landing.",
  });

  const apiKeyResult = verifyIncomingApiKey(xApiKey, authorization);
  const apiKeyProvided = isApiKeyPresent(xApiKey, authorization);
  if (apiKeyResult.ok && (requireApiKey || apiKeyProvided || apiKeyAuthEnabled || allowNoAuth)) {
    authContextStorage.enterWith({
      method: apiKeyAuthEnabled ? "api_key" : "bypass",
      keyFingerprint: apiKeyResult.keyFingerprint,
      authBypass: !apiKeyAuthEnabled && allowNoAuth,
    });
    return undefined;
  }

  if (!requireApiKey && allowSessionAuth) {
    const session = await findRequestSession(database, cookieHeader);
    if (session) {
      authContextStorage.enterWith({
        method: "session",
        keyFingerprint: undefined,
        userId: session.userId,
        username: session.user.username,
        authBypass: false,
      });
      return undefined;
    }
  }

  if (requireApiKey) {
    return c.json(unauthorizedBody(apiKeyResult.reason ?? "missing_key"), 401);
  }

  if (allowNoAuth) {
    authContextStorage.enterWith({
      method: "bypass",
      authBypass: true,
    });
    return undefined;
  }

  const reason = apiKeyResult.reason ?? "unauthorized";
  return c.json(unauthorizedBody(reason), 401);
}
