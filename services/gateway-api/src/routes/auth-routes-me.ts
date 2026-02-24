import { server, database } from "../state.js";
import {
  findRequestSession,
  toPublicUser,
  isApiKeyPresent,
  verifyIncomingApiKey,
} from "../auth.js";
import { unauthorizedBody } from "../helpers.js";
import { ownerScopesForSessionUser } from "./auth-routes-common.js";

export function registerAuthMeRoute(app: typeof server.app) {
  app.get("/api/auth/me", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (session) {
      return c.json({
        ok: true,
        authenticated: true,
        method: "session",
        user: toPublicUser(session.user),
        ownerScopes: ownerScopesForSessionUser(session.user.id),
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
}
