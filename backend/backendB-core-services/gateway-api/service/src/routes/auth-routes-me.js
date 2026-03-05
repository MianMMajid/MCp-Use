import { database } from "../state.js";
import { findRequestSession, toPublicUser } from "../auth.js";
import { extractApiKeyFromHeaders, verifyApiKey } from "@maple/security";
import { unauthorizedBody } from "@maple/common";
import {
    allowNoAuth,
    apiKeyAuthEnabled,
    configuredApiKeys,
} from "../config.js";
import { ownerScopesForSessionUser } from "./auth-routes-common.js";

async function resolveSessionUser(session) {
    if (!session) {
        return undefined;
    }
    if (session.user && typeof session.user.id === "string") {
        return session.user;
    }
    if (
        typeof session.userId === "string" &&
        typeof database.findUserById === "function"
    ) {
        return database.findUserById(session.userId);
    }
    return undefined;
}

export function registerAuthMeRoute(app) {
    app.get("/api/auth/me", async (c) => {
        const session = await findRequestSession(database, c.req.header("cookie"));
        const sessionUser = await resolveSessionUser(session);
        if (session && sessionUser) {
            return c.json({
                ok: true,
                authenticated: true,
                method: "session",
                user: toPublicUser(sessionUser),
                ownerScopes: ownerScopesForSessionUser(sessionUser.id),
            });
        }

        const xApiKey = c.req.header("x-api-key");
        const authorization = c.req.header("authorization");
        const providedKey = extractApiKeyFromHeaders(xApiKey, authorization);

        if (providedKey) {
            if (!apiKeyAuthEnabled) {
                if (!allowNoAuth) {
                    return c.json(unauthorizedBody("misconfigured"), 401);
                }
                return c.json({
                    ok: true,
                    authenticated: true,
                    method: "api_key",
                    user: null,
                    ownerScopes: [],
                });
            }

            const apiKeyResult = verifyApiKey(configuredApiKeys, providedKey);
            if (!apiKeyResult.ok) {
                return c.json(unauthorizedBody(apiKeyResult.reason ?? "invalid_key"), 401);
            }

            return c.json({
                ok: true,
                authenticated: true,
                method: "api_key",
                user: null,
                ownerScopes: apiKeyResult.keyFingerprint
                    ? [apiKeyResult.keyFingerprint]
                    : [],
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
