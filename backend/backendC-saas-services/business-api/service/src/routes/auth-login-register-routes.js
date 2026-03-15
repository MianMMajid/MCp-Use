import { asString, readJsonBody } from "@maple/common";
import { hashPassword, verifyPassword } from "@maple/security";
import { allowSelfSignup, sessionTtlSeconds } from "../config.js";
import { buildSessionCookie } from "../auth-session.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";

export function registerAuthLoginRegisterRoutes(app, options) {
  const database = options.database;

  app.post("/api/business/auth/login", async (c) => {
    const body = await readJsonBody(c);
    const username = asString(body.username);
    const password = asString(body.password);
    if (!username || !password) {
      return c.json({ error: "username and password are required." }, 400);
    }

    const user = await database.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return c.json({ error: "Invalid username or password." }, 401);
    }

    const session = await database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json(buildSessionAuthResponse(user, session));
  });

  app.post("/api/business/auth/register", async (c) => {
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
    if (email && typeof database.findUserByEmail === "function" && await database.findUserByEmail(email)) {
      return c.json({ error: "Email already exists." }, 409);
    }

    const user = await database.createUser({
      username,
      email,
      passwordHash: hashPassword(password),
    });
    const session = await database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json(buildSessionAuthResponse(user, session));
  });
}
