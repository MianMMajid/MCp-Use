import { apiKeyAuthEnabled, allowNoAuth, configuredApiKeys, } from "./config.js";
import { extractApiKeyFromHeaders, verifyApiKey, } from "@maple/security";
import { authContextStorage } from "./auth-context.js";
import { findRequestSession } from "./auth-session.js";
import { apiErrorPayload } from "./api-error.js";
export function verifyIncomingApiKey(xApiKey, authorization) {
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
    const result = verifyApiKey(configuredApiKeys, fromHeaders);
    if (!result.ok) {
        return result;
    }
    return result;
}
export function isApiKeyPresent(xApiKey, authorization) {
    return Boolean(extractApiKeyFromHeaders(xApiKey, authorization));
}
export async function requireApiKeyResponse(c, database, options = {}) {
    const allowSessionAuth = options.allowSession ?? true;
    const requireApiKey = options.requireApiKey ?? false;
    const xApiKey = c.req.header("x-api-key");
    const authorization = c.req.header("authorization");
    const cookieHeader = c.req.header("cookie");
    const unauthorizedBody = (reason) => ({
        ...apiErrorPayload("UNAUTHORIZED", "Unauthorized"),
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
//# sourceMappingURL=auth-api-key.js.map
