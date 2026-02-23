import { randomUUID } from "node:crypto";
import { server, database } from "../state.js";
import { sessionTtlSeconds, allowSelfSignup, googleClientId } from "../config.js";
import {
  findRequestSession,
  buildSessionCookie,
  clearSessionCookieHeader,
  sessionCookieValue,
  toPublicUser,
  isApiKeyPresent,
  verifyIncomingApiKey,
  resolveSessionOwnerFingerprint,
  verifyGoogleJwt,
} from "../auth.js";
import { asString, readJsonBody, dedupeBy, unauthorizedBody } from "../helpers.js";
import { hashPassword, verifyPassword } from "../../security/password-auth.js";

// ── GET /api/auth/me ────────────────────────────────────────────────────────

server.get("/api/auth/me", async (c) => {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (session) {
    const userScoped = `user:${session.user.id}`;
    const sessionScoped = resolveSessionOwnerFingerprint(session.user.id);
    const ownerScopes = dedupeBy([sessionScoped, userScoped], (entry) => entry);
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

// ── POST /api/auth/login ────────────────────────────────────────────────────

server.app.post("/api/auth/login", async (c) => {
  const body = await readJsonBody(c);
  const username = asString(body.username);
  const password = asString(body.password);
  console.log(`[LOGIN-DEBUG] username=${JSON.stringify(username)} password=${JSON.stringify(password)} bodyKeys=${JSON.stringify(Object.keys(body))}`);
  if (!username || !password) {
    return c.json({ error: "username and password are required." }, 400);
  }

  const user = await database.findUserByUsername(username);
  console.log(`[LOGIN-DEBUG] userFound=${!!user} hashPrefix=${user?.passwordHash?.slice(0, 20)}`);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    console.log(`[LOGIN-DEBUG] REJECTED — verifyPassword=${user ? verifyPassword(password, user.passwordHash) : "no-user"}`);
    return c.json({ error: "Invalid username or password." }, 401);
  }

  const session = await database.createSession(user.id, sessionTtlSeconds);
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

// ── Google Sign-In ──────────────────────────────────────────────────────────

server.app.get("/api/auth/google/client-id", async (c) => {
  return c.json({ clientId: googleClientId });
});

server.app.post("/api/auth/google", async (c) => {
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

  let user = await database.findUserByEmail(googleUser.email);

  if (!user) {
    // Auto-create user from Google account
    let baseUsername = googleUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
    if (!baseUsername) baseUsername = "user";
    let username = baseUsername;
    while (await database.findUserByUsername(username)) {
      username = baseUsername + "_" + randomUUID().slice(0, 6);
    }
    user = await database.createUser({
      username,
      email: googleUser.email,
      passwordHash: "google-oauth:no-password",
    });
  }

  const session = await database.createSession(user.id, sessionTtlSeconds);
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

// ── POST /api/auth/register ─────────────────────────────────────────────────

server.app.post("/api/auth/register", async (c) => {
  const existingUsers = await database.countUsers();
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

  if (await database.findUserByUsername(username)) {
    return c.json({ error: "Username already exists." }, 409);
  }

  const user = await database.createUser({
    username,
    email,
    passwordHash: hashPassword(password),
  });
  const session = await database.createSession(user.id, sessionTtlSeconds);
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

// ── POST /api/auth/logout ───────────────────────────────────────────────────

server.app.post("/api/auth/logout", async (c) => {
  const sessionId = sessionCookieValue(c.req.header("cookie"));
  if (sessionId) {
    await database.revokeSession(sessionId);
  }
  c.header("set-cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});
