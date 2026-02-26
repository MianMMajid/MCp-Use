import { randomUUID } from "node:crypto";
import { asString, readJsonBody } from "@maple/common";
import { googleClientId, sessionTtlSeconds } from "../config.js";
import { buildSessionCookie } from "../auth-session.js";
import { verifyGoogleJwt } from "../auth-google.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { apiErrorResponse } from "../api-error.js";

export function registerAuthGoogleRoutes(app, options) {
  const database = options.database;
  const resolvedGoogleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? googleClientId;

  app.get("/api/business/auth/google/client-id", async (c) => {
    return c.json({
      clientId: resolvedGoogleClientId,
      configured: Boolean(resolvedGoogleClientId),
    });
  });

  app.post("/api/business/auth/google", async (c) => {
    const body = await readJsonBody(c);
    if (!resolvedGoogleClientId) {
      return apiErrorResponse(
        c,
        503,
        "GOOGLE_AUTH_UNAVAILABLE",
        "Google sign-in is unavailable."
      );
    }
    const credential = asString(body.credential);
    if (!credential) {
      return apiErrorResponse(
        c,
        400,
        "INVALID_ARGUMENT",
        "credential is required."
      );
    }
    let googleUser;
    try {
      googleUser = await verifyGoogleJwt(credential);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      return apiErrorResponse(c, 401, "UNAUTHORIZED", message);
    }

    let user = await database.findUserByEmail(googleUser.email);
    if (!user) {
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
    return c.json({
      ...buildSessionAuthResponse(user, session),
    });
  });
}
