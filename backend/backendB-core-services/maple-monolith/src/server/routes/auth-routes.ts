import { createPublicKey, createVerify, randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { MapleSessionWithUser, MapleSqliteDatabase, MapleUser } from "../../persistence/sqlite-db.js";
import { hashPassword, verifyPassword } from "../../security/password-auth.js";

type ApiKeyVerificationResult =
  | {
      ok: true;
      keyFingerprint?: string;
    }
  | {
      ok: false;
      reason?: string;
    };

interface RegisterAuthRoutesDeps {
  allowSelfSignup: boolean;
  asString: (value: unknown) => string | undefined;
  buildSessionCookie: (sessionId: string, maxAgeSeconds: number) => string;
  clearSessionCookieHeader: () => string;
  database: MapleSqliteDatabase;
  findRequestSession: (cookieHeader?: string) => MapleSessionWithUser | undefined;
  isApiKeyPresent: (xApiKey?: string, authorization?: string) => boolean;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  resolveSessionOwnerFingerprint: (userId: string) => string;
  sessionCookieValue: (cookieHeader?: string) => string | undefined;
  sessionTtlSeconds: number;
  toPublicUser: (user: Pick<MapleUser, "id" | "username" | "email">) => unknown;
  unauthorizedBody: (reason: string) => unknown;
  verifyIncomingApiKey: (xApiKey?: string, authorization?: string) => ApiKeyVerificationResult;
}

interface GoogleJwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
}

export function registerAuthRoutes(app: Hono, deps: RegisterAuthRoutesDeps): void {
  const {
    allowSelfSignup,
    asString,
    buildSessionCookie,
    clearSessionCookieHeader,
    database,
    findRequestSession,
    isApiKeyPresent,
    readJsonBody,
    resolveSessionOwnerFingerprint,
    sessionCookieValue,
    sessionTtlSeconds,
    toPublicUser,
    unauthorizedBody,
    verifyIncomingApiKey,
  } = deps;

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  let googleCertsCache: { keys: Record<string, string>; expiresAt: number } | null = null;

  const getGooglePublicKeys = async (): Promise<Record<string, string>> => {
    if (googleCertsCache && Date.now() < googleCertsCache.expiresAt) {
      return googleCertsCache.keys;
    }
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!res.ok) throw new Error("Failed to fetch Google public keys");
    const jwks = (await res.json()) as { keys: GoogleJwk[] };
    const keys: Record<string, string> = {};
    for (const jwk of jwks.keys) {
      const pubKey = createPublicKey({ key: jwk, format: "jwk" });
      keys[jwk.kid] = pubKey.export({ type: "spki", format: "pem" }) as string;
    }
    googleCertsCache = { keys, expiresAt: Date.now() + 3_600_000 };
    return keys;
  };

  const decodeJwtPart = (part: string): Record<string, unknown> => {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  };

  const verifyGoogleJwt = async (token: string): Promise<{ email: string; name: string }> => {
    if (!googleClientId) {
      throw new Error("Google sign-in is not configured.");
    }

    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");

    const header = decodeJwtPart(parts[0]) as { kid?: string };
    const payload = decodeJwtPart(parts[1]) as {
      iss?: string;
      aud?: string;
      exp?: number;
      email?: string;
      name?: string;
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

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signatureInput);
    if (!verifier.verify(keys[kid], signature)) {
      throw new Error("Invalid signature");
    }

    return { email: payload.email, name: payload.name || "" };
  };

  app.get("/api/auth/me", (c) => {
    const session = findRequestSession(c.req.header("cookie"));
    if (session) {
      const userScoped = `user:${session.user.id}`;
      const sessionScoped = resolveSessionOwnerFingerprint(session.user.id);
      const ownerScopes = Array.from(new Set([sessionScoped, userScoped]));
      return c.json({
        ok: true,
        authenticated: true,
        method: "session",
        user: toPublicUser(session.user),
        ownerScopes,
      });
    }

    const xApiKey = c.req.header("x-api-key");
    const authorization = c.req.header("authorization");
    const apiKeyProvided = isApiKeyPresent(xApiKey, authorization);
    const apiKeyResult = verifyIncomingApiKey(xApiKey, authorization);
    if (apiKeyProvided) {
      if (!apiKeyResult.ok) {
        return c.json(unauthorizedBody(apiKeyResult.reason ?? "invalid_key"), 401);
      }
      return c.json({
        ok: true,
        authenticated: true,
        method: "api_key",
        user: null,
        ownerScopes: apiKeyResult.keyFingerprint ? [apiKeyResult.keyFingerprint] : [],
      });
    }

    return c.json({
      ok: true,
      authenticated: false,
      method: null,
      user: null,
      ownerScopes: [],
    });
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJsonBody(c);
    const username = asString(body.username);
    const password = asString(body.password);
    if (!username || !password) {
      return c.json({ error: "username and password are required." }, 400);
    }

    const user = database.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return c.json({ error: "Invalid username or password." }, 401);
    }

    const session = database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json({
      ok: true,
      authenticated: true,
      method: "session",
      user: toPublicUser(user),
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    });
  });

  app.get("/api/auth/google/client-id", (c) => {
    return c.json({ clientId: googleClientId });
  });

  app.post("/api/auth/google", async (c) => {
    if (!googleClientId) {
      return c.json({ error: "Google sign-in is not configured." }, 501);
    }

    const body = await readJsonBody(c);
    const credential = asString(body.credential);
    if (!credential) {
      return c.json({ error: "credential is required." }, 400);
    }

    let googleUser: { email: string; name: string };
    try {
      googleUser = await verifyGoogleJwt(credential);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Token verification failed";
      return c.json({ error: msg }, 401);
    }

    let user = database.findUserByEmail(googleUser.email);
    if (!user) {
      let baseUsername = googleUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
      if (!baseUsername) baseUsername = "user";
      let username = baseUsername;
      while (database.findUserByUsername(username)) {
        username = `${baseUsername}_${randomUUID().slice(0, 6)}`;
      }
      user = database.createUser({
        username,
        email: googleUser.email,
        passwordHash: "google-oauth:no-password",
      });
    }

    const session = database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json({
      ok: true,
      authenticated: true,
      method: "session",
      user: toPublicUser(user),
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    });
  });

  app.post("/api/auth/register", async (c) => {
    const existingUsers = database.countUsers();
    if (!allowSelfSignup && existingUsers > 0) {
      return c.json({ error: "Self-signup is disabled." }, 403);
    }

    const body = await readJsonBody(c);
    const username = asString(body.username);
    const password = asString(body.password);
    const email = asString(body.email);
    if (!username || !password) {
      return c.json({ error: "username and password are required." }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: "password must be at least 8 characters." }, 400);
    }

    if (database.findUserByUsername(username)) {
      return c.json({ error: "Username already exists." }, 409);
    }

    const user = database.createUser({
      username,
      email,
      passwordHash: hashPassword(password),
    });
    const session = database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json({
      ok: true,
      authenticated: true,
      method: "session",
      user: toPublicUser(user),
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    });
  });

  app.post("/api/auth/logout", (c) => {
    const sessionId = sessionCookieValue(c.req.header("cookie"));
    if (sessionId) {
      database.revokeSession(sessionId);
    }
    c.header("set-cookie", clearSessionCookieHeader());
    return c.json({ ok: true });
  });
}
