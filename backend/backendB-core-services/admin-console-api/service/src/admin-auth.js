import { extractApiKeyFromHeaders, verifyApiKey } from "@maple/security";
import { apiErrorResponse } from "./api-error.js";

function normalizeConfiguredKeys(value) {
    return Array.isArray(value)
        ? value.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0)
        : [];
}

export function verifyAdminRequest(options = {}) {
    const configuredKeys = normalizeConfiguredKeys(options.apiKeys);
    const allowNoAuth = options.allowNoAuth === true;
    // SAFETY: config.js throws an error if NODE_ENV=production and allowNoAuth is set,
    // preventing this bypass from being active in production environments.
    if (allowNoAuth) {
        return {
            ok: true,
            mode: "bypass",
            reason: "allow_no_auth",
        };
    }
    if (configuredKeys.length === 0) {
        return {
            ok: false,
            status: 503,
            code: "ADMIN_AUTH_MISCONFIGURED",
            error: "Admin authentication is not configured.",
            details: "Set MAPLE_ADMIN_API_KEY or MAPLE_ADMIN_API_KEYS.",
        };
    }
    const provided = extractApiKeyFromHeaders(options.xApiKey, options.authorization);
    const result = verifyApiKey(configuredKeys, provided);
    if (!result.ok) {
        const reason = result.reason ?? "missing_key";
        return {
            ok: false,
            status: 401,
            code: reason === "invalid_key" ? "ADMIN_AUTH_INVALID_KEY" : "ADMIN_AUTH_REQUIRED",
            error: reason === "invalid_key" ? "Invalid admin API key." : "Admin authentication required.",
            details: "Provide x-api-key or Authorization: Bearer <token>.",
        };
    }
    return {
        ok: true,
        mode: "api_key",
        keyFingerprint: result.keyFingerprint ?? "",
    };
}

export function createAdminAuthMiddleware(options = {}) {
    const configuredKeys = normalizeConfiguredKeys(options.apiKeys);
    const allowNoAuth = options.allowNoAuth === true;
    return async (c, next) => {
        const decision = verifyAdminRequest({
            apiKeys: configuredKeys,
            allowNoAuth,
            xApiKey: c.req.header("x-api-key"),
            authorization: c.req.header("authorization"),
        });
        if (!decision.ok) {
            return apiErrorResponse(
                c,
                decision.status ?? 401,
                decision.code ?? "ADMIN_AUTH_REQUIRED",
                decision.error ?? "Admin authentication required.",
                decision.details
            );
        }
        await next();
    };
}
