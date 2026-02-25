import { randomUUID } from "node:crypto";
import { asString, readJsonBody } from "@maple/common";
import { googleClientId, sessionTtlSeconds } from "../config.js";
import { buildSessionCookie } from "../auth-session.js";
import { verifyGoogleJwt } from "../auth-google.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { apiErrorResponse } from "../api-error.js";

function parseBooleanEnv(rawValue, defaultValue) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return defaultValue;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function parseSimulatedGoogleUser(body) {
  const directEmail = asString(body.email);
  const directName = asString(body.name);
  const credential = asString(body.credential);

  if (directEmail && isValidEmail(directEmail)) {
    return {
      email: directEmail.toLowerCase(),
      name: directName ?? directEmail.split("@")[0],
    };
  }

  if (credential) {
    if (isValidEmail(credential)) {
      return {
        email: credential.toLowerCase(),
        name: directName ?? credential.split("@")[0],
      };
    }
    if (credential.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(credential);
        const parsedEmail = asString(parsed?.email);
        if (parsedEmail && isValidEmail(parsedEmail)) {
          return {
            email: parsedEmail.toLowerCase(),
            name: asString(parsed?.name) ?? directName ?? parsedEmail.split("@")[0],
          };
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function registerAuthGoogleRoutes(app, options) {
  const database = options.database;
  const resolvedGoogleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? googleClientId;
  const isProduction =
    String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const googleSimulationEnabled =
    !resolvedGoogleClientId &&
    !isProduction &&
    parseBooleanEnv(
      process.env.MAPLE_GOOGLE_AUTH_SIMULATION,
      false
    );

  app.get("/api/business/auth/google/client-id", async (c) => {
    return c.json({
      clientId: resolvedGoogleClientId,
      configured: Boolean(resolvedGoogleClientId),
      simulated: googleSimulationEnabled,
    });
  });

  app.post("/api/business/auth/google", async (c) => {
    const body = await readJsonBody(c);
    let googleUser;
    if (!resolvedGoogleClientId) {
      if (!googleSimulationEnabled) {
        return apiErrorResponse(
          c,
          503,
          "GOOGLE_AUTH_UNAVAILABLE",
          "Google sign-in is unavailable."
        );
      }
      googleUser = parseSimulatedGoogleUser(body);
      if (!googleUser) {
        return apiErrorResponse(
          c,
          400,
          "INVALID_ARGUMENT",
          "For simulated Google auth provide email or a credential containing an email."
        );
      }
    } else {
      const credential = asString(body.credential);
      if (!credential) {
        return apiErrorResponse(
          c,
          400,
          "INVALID_ARGUMENT",
          "credential is required."
        );
      }
      try {
        googleUser = await verifyGoogleJwt(credential);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Token verification failed";
        return apiErrorResponse(c, 401, "UNAUTHORIZED", message);
      }
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
      simulated: !resolvedGoogleClientId,
    });
  });
}
