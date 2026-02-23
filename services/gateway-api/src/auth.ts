import { AsyncLocalStorage } from "node:async_hooks";
import { createPublicKey, createVerify, randomUUID } from "node:crypto";
import { asString, dedupeBy, envValue } from "./helpers.js";
import {
  apiKeyAuthEnabled,
  allowNoAuth,
  configuredApiKeys,
  sessionCookieName,
  sessionTtlSeconds,
  sessionOwnerScopeMode,
  primaryConfiguredApiKeyFingerprint,
  googleClientId,
} from "./config.js";
import {
  extractApiKeyFromHeaders,
  verifyApiKey,
} from "@maple/security";
import { hashPassword, verifyPassword } from "@maple/security";
import type {
  MaplePostgresDatabase,
  MapleSessionWithUser,
  MapleUser,
} from "@maple/persistence";

export const authContextStorage = new AsyncLocalStorage<{
  method: "api_key" | "session" | "bypass";
  keyFingerprint?: string;
  userId?: string;
  username?: string;
  authBypass: boolean;
}>();

export function resolveSessionOwnerFingerprint(userId: string): string {
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

export function currentOwnerKeyFingerprintsForLookup(): string[] | undefined {
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

export function currentOwnerKeyFingerprint(): string | undefined {
  const auth = authContextStorage.getStore();
  if (!auth || auth.authBypass) {
    return undefined;
  }
  if (auth.method === "session" && auth.userId) {
    return resolveSessionOwnerFingerprint(auth.userId);
  }
  return auth.keyFingerprint;
}

export function parseCookieHeader(header?: string): Record<string, string> {
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

export function sessionCookieValue(cookieHeader?: string): string | undefined {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[sessionCookieName];
  return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
}

export function buildSessionCookie(sessionId: string, maxAgeSeconds: number): string {
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

export function clearSessionCookieHeader(): string {
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

export async function findRequestSession(
  database: MaplePostgresDatabase,
  cookieHeader?: string
): Promise<MapleSessionWithUser | undefined> {
  const sessionId = sessionCookieValue(cookieHeader);
  if (!sessionId) {
    return undefined;
  }
  return database.findActiveSession(sessionId);
}

export function toPublicUser(user: Pick<MapleUser, "id" | "username" | "email">) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

export async function bootstrapAuthUsers(database: MaplePostgresDatabase) {
  await database.purgeExpiredSessions();
  const existingUsers = await database.countUsers();
  const adminUsername = envValue(process.env.MAPLE_ADMIN_USERNAME) ?? "";
  const adminPassword = envValue(process.env.MAPLE_ADMIN_PASSWORD) ?? "";
  const adminEmail = envValue(process.env.MAPLE_ADMIN_EMAIL);

  if (adminUsername && adminPassword) {
    const syncedUser = await database.syncUserPasswordByUsername({
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
    await database.createUser({
      username: devUser,
      email: envValue(process.env.MAPLE_DEV_EMAIL) || "admin@local.maple",
      passwordHash: hashPassword(devPass),
    });
    console.log(`[AUTH] Bootstrapped local dev user "${devUser}" with MAPLE_DEV_PASSWORD/default.`);
    return;
  }
}

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
  options: RequireAuthOptions = {}
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

// ── Google Sign-In ──────────────────────────────────────────────────────────

let googleCertsCache: { keys: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (googleCertsCache && Date.now() < googleCertsCache.expiresAt) {
    return googleCertsCache.keys;
  }
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("Failed to fetch Google public keys");
  const jwks = (await res.json()) as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
  const keys: Record<string, string> = {};
  for (const jwk of jwks.keys) {
    const pubKey = createPublicKey({ key: jwk, format: "jwk" });
    keys[jwk.kid] = pubKey.export({ type: "spki", format: "pem" }) as string;
  }
  googleCertsCache = { keys, expiresAt: Date.now() + 3600_000 };
  return keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

export async function verifyGoogleJwt(token: string): Promise<{ email: string; name: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const header = decodeJwtPart(parts[0]) as { kid?: string; alg?: string };
  const payload = decodeJwtPart(parts[1]) as {
    iss?: string; aud?: string; exp?: number; email?: string; name?: string;
  };

  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error("Invalid issuer");
  }
  if (payload.aud !== googleClientId) {
    throw new Error("Invalid audience");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  if (!payload.email) {
    throw new Error("No email in token");
  }

  const keys = await getGooglePublicKeys();
  const kid = header.kid;
  if (!kid || !keys[kid]) {
    throw new Error("Unknown signing key");
  }

  const signatureInput = parts[0] + "." + parts[1];
  const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signatureInput);
  if (!verifier.verify(keys[kid], signature)) {
    throw new Error("Invalid signature");
  }

  return { email: payload.email, name: payload.name || "" };
}
