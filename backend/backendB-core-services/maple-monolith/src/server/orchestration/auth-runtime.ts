import { AsyncLocalStorage } from "node:async_hooks";
import type {
  MapleSessionWithUser,
  MapleSqliteDatabase,
  MapleUser,
} from "../../persistence/sqlite-db.js";
import {
  extractApiKeyFromHeaders,
  verifyApiKey,
  type ApiKeyVerificationResult,
} from "../../security/api-key.js";
import { hashPassword } from "../../security/password-auth.js";
import { envValue } from "./value-utils.js";
import type { SessionOwnerScopeMode } from "./runtime-config.js";

interface RequireAuthOptions {
  allowSession?: boolean;
  requireApiKey?: boolean;
}

interface CreateAuthRuntimeOptions {
  allowNoAuth: boolean;
  configuredApiKeys: string[];
  database: MapleSqliteDatabase;
  dedupeBy: <T>(items: T[], key: (item: T) => string) => T[];
  primaryConfiguredApiKeyFingerprint?: string;
  sessionCookieName: string;
  sessionOwnerScopeMode: SessionOwnerScopeMode;
}

type AuthContext = {
  method: "api_key" | "session" | "bypass";
  keyFingerprint?: string;
  userId?: string;
  username?: string;
  authBypass: boolean;
};

export function createAuthRuntime(options: CreateAuthRuntimeOptions) {
  const {
    allowNoAuth,
    configuredApiKeys,
    database,
    dedupeBy,
    primaryConfiguredApiKeyFingerprint,
    sessionCookieName,
    sessionOwnerScopeMode,
  } = options;

  const apiKeyAuthEnabled = configuredApiKeys.length > 0;
  const authContextStorage = new AsyncLocalStorage<AuthContext>();

  function unauthorizedBody(reason: string) {
    return {
      error: "Unauthorized",
      reason,
      hint: "Provide x-api-key / Authorization bearer token or sign in via /landing.",
    };
  }

  function resolveSessionOwnerFingerprint(userId: string): string {
    const userScoped = `user:${userId}`;
    const primaryKeyScoped = primaryConfiguredApiKeyFingerprint;
    if (sessionOwnerScopeMode === "user") {
      return userScoped;
    }
    if (sessionOwnerScopeMode === "api_key_primary") {
      return primaryKeyScoped ?? userScoped;
    }
    return primaryKeyScoped ?? userScoped;
  }

  function currentOwnerKeyFingerprintsForLookup(): string[] | undefined {
    const auth = authContextStorage.getStore();
    if (!auth || auth.authBypass) {
      return undefined;
    }
    if (auth.method === "session" && auth.userId) {
      const userScoped = `user:${auth.userId}`;
      const sessionScoped = resolveSessionOwnerFingerprint(auth.userId);
      const out = [sessionScoped];
      if (sessionScoped !== userScoped) {
        out.push(userScoped);
      }
      return dedupeBy(out, (entry) => entry);
    }
    if (auth.keyFingerprint) {
      return [auth.keyFingerprint];
    }
    return undefined;
  }

  function currentOwnerKeyFingerprint(): string | undefined {
    const auth = authContextStorage.getStore();
    if (!auth || auth.authBypass) {
      return undefined;
    }
    if (auth.method === "session" && auth.userId) {
      return resolveSessionOwnerFingerprint(auth.userId);
    }
    return auth.keyFingerprint;
  }

  function parseCookieHeader(header?: string): Record<string, string> {
    if (!header) {
      return {};
    }
    const cookies: Record<string, string> = {};
    for (const part of header.split(";")) {
      const [rawName, ...rawValue] = part.split("=");
      const name = rawName?.trim();
      if (!name) {
        continue;
      }
      const value = rawValue.join("=").trim();
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }

  function sessionCookieValue(cookieHeader?: string): string | undefined {
    const cookies = parseCookieHeader(cookieHeader);
    const sessionId = cookies[sessionCookieName];
    return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
  }

  function buildSessionCookie(sessionId: string, maxAgeSeconds: number): string {
    const parts = [
      `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
    ];
    if (process.env.NODE_ENV === "production") {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  function clearSessionCookieHeader(): string {
    const parts = [
      `${sessionCookieName}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
    ];
    if (process.env.NODE_ENV === "production") {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  function findRequestSession(cookieHeader?: string): MapleSessionWithUser | undefined {
    const sessionId = sessionCookieValue(cookieHeader);
    if (!sessionId) {
      return undefined;
    }
    return database.findActiveSession(sessionId);
  }

  function toPublicUser(user: Pick<MapleUser, "id" | "username" | "email">) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  }

  function bootstrapAuthUsers() {
    database.purgeExpiredSessions();
    const existingUsers = database.countUsers();
    const adminUsername = envValue(process.env.MAPLE_ADMIN_USERNAME) ?? "";
    const adminPassword = envValue(process.env.MAPLE_ADMIN_PASSWORD) ?? "";
    const adminEmail = envValue(process.env.MAPLE_ADMIN_EMAIL);

    if (adminUsername && adminPassword) {
      const syncedUser = database.syncUserPasswordByUsername({
        username: adminUsername,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
      });
      const action = existingUsers > 0 ? "Synced" : "Bootstrapped";
      console.log(`[AUTH] ${action} admin user "${syncedUser.username}" from MAPLE_ADMIN_* env.`);
      return;
    }

    if (existingUsers > 0) {
      return;
    }

    if (!adminUsername || !adminPassword) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "No users found. Set MAPLE_ADMIN_USERNAME and MAPLE_ADMIN_PASSWORD for production startup."
        );
      }
      const devUser = envValue(process.env.MAPLE_DEV_USERNAME) || "admin";
      const devPass = envValue(process.env.MAPLE_DEV_PASSWORD) || "maple-demo-password";
      database.createUser({
        username: devUser,
        email: envValue(process.env.MAPLE_DEV_EMAIL) || "admin@local.maple",
        passwordHash: hashPassword(devPass),
      });
      console.log(
        `[AUTH] Bootstrapped local dev user "${devUser}" with MAPLE_DEV_PASSWORD/default.`
      );
    }
  }

  function verifyIncomingApiKey(
    xApiKey?: string,
    authorization?: string
  ): ApiKeyVerificationResult {
    if (!apiKeyAuthEnabled) {
      if (allowNoAuth) {
        return { ok: true };
      }
      return {
        ok: false,
        reason: "misconfigured",
      };
    }

    const fromHeaders = extractApiKeyFromHeaders(xApiKey, authorization);

    if (!fromHeaders && allowNoAuth) {
      return { ok: true };
    }

    return verifyApiKey(configuredApiKeys, fromHeaders);
  }

  function isApiKeyPresent(xApiKey?: string, authorization?: string): boolean {
    return Boolean(extractApiKeyFromHeaders(xApiKey, authorization));
  }

  function requireApiKeyResponse(
    c: {
      req: {
        header: (name: string) => string | undefined;
      };
      json: (body: unknown, status?: number) => Response;
    },
    options: RequireAuthOptions = {}
  ) {
    const allowSessionAuth = options.allowSession ?? true;
    const requireApiKey = options.requireApiKey ?? false;
    const xApiKey = c.req.header("x-api-key");
    const authorization = c.req.header("authorization");
    const cookieHeader = c.req.header("cookie");

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
      const session = findRequestSession(cookieHeader);
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

  return {
    apiKeyAuthEnabled,
    bootstrapAuthUsers,
    buildSessionCookie,
    clearSessionCookieHeader,
    currentOwnerKeyFingerprint,
    currentOwnerKeyFingerprintsForLookup,
    findRequestSession,
    isApiKeyPresent,
    requireApiKeyResponse,
    resolveSessionOwnerFingerprint,
    sessionCookieValue,
    toPublicUser,
    unauthorizedBody,
    verifyIncomingApiKey,
  };
}
