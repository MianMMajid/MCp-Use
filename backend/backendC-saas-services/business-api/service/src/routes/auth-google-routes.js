import { randomUUID } from "node:crypto";
import { asString, readJsonBody } from "@maple/common";
import { googleClientId, sessionTtlSeconds, allowSelfSignup } from "../config.js";
import { buildSessionCookie } from "../auth-session.js";
import { verifyGoogleJwt } from "../auth-google.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";

export function registerAuthGoogleRoutes(app, options) {
  const database = options.database;

  app.get("/api/business/auth/google/client-id", async (c) => {
    return c.json({ clientId: googleClientId });
  });

  app.post("/api/business/auth/google", async (c) => {
    if (!googleClientId) {
      return c.json({ error: "Google sign-in is not configured." }, 501);
    }

    const body = await readJsonBody(c);
    const credential = asString(body.credential);
    if (!credential) {
      return c.json({ error: "credential is required." }, 400);
    }

    let googleUser;
    try {
      googleUser = await verifyGoogleJwt(credential);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      return c.json({ error: message }, 401);
    }

    let user = await database.findUserByEmail(googleUser.email);
    if (!user) {
      // Enforce signup policy — same as regular register
      if (!allowSelfSignup) {
        const existingUsers = await database.countUsers();
        if (existingUsers > 0) {
          return c.json({ error: "Self-signup is disabled." }, 403);
        }
      }
      let baseUsername = googleUser.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 30);
      if (!baseUsername) {
        baseUsername = "user";
      }

      let username = baseUsername;
      while (await database.findUserByUsername(username)) {
        username = `${baseUsername}_${randomUUID().slice(0, 6)}`;
      }

      user = await database.createUser({
        username,
        email: googleUser.email,
        passwordHash: "google-oauth:no-password",
      });
    }

    const session = await database.createSession(user.id, sessionTtlSeconds);
    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
    return c.json(buildSessionAuthResponse(user, session));
  });
}
