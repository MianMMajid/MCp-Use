import crypto from "node:crypto";
import { GPT_OAUTH_CLIENT_ID, GPT_OAUTH_CLIENT_SECRET, } from "../config.js";
import { asString, readJsonBody } from "../helpers.js";
import { gptAdapterBaseUrl } from "./gpt-adapter-common.js";

// ---------------------------------------------------------------------------
// Configurable allowlist for redirect URIs (origins only).
// Override via GPT_OAUTH_ALLOWED_REDIRECT_URIS env var (comma-separated).
// ---------------------------------------------------------------------------
const GPT_OAUTH_ALLOWED_REDIRECT_URIS = (() => {
    const raw = (process.env.GPT_OAUTH_ALLOWED_REDIRECT_URIS ?? "").trim();
    if (raw.length > 0) {
        return raw.split(",").map((u) => u.trim()).filter((u) => u.length > 0);
    }
    return ["https://chatgpt.com", "https://chat.openai.com"];
})();

// ---------------------------------------------------------------------------
// In-memory stores for auth codes and access tokens.
// ---------------------------------------------------------------------------

/** Auth code store: code -> { redirectUri, expiresAt, used } */
const authCodes = new Map();

/** Access token store: token -> { expiresAt } */
const activeTokens = new Map();

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 1000;         // 1 minute

// ---------------------------------------------------------------------------
// Periodic cleanup of expired codes and tokens.
// ---------------------------------------------------------------------------
setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of authCodes) {
        if (now >= entry.expiresAt) {
            authCodes.delete(code);
        }
    }
    for (const [token, entry] of activeTokens) {
        if (now >= entry.expiresAt) {
            activeTokens.delete(token);
        }
    }
}, CLEANUP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// Public helper: verify a GPT access token (used by the tool dispatch route).
// ---------------------------------------------------------------------------
export function verifyGptAccessToken(token) {
    if (!token) return false;
    const entry = activeTokens.get(token);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
        activeTokens.delete(token);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Route registration.
// ---------------------------------------------------------------------------
export function registerGptOAuthRoutes(app) {
    app.get("/.well-known/oauth-authorization-server", async (c) => {
        const baseUrl = gptAdapterBaseUrl();
        return c.json({
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/gpt/oauth/authorize`,
            token_endpoint: `${baseUrl}/gpt/oauth/token`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
            code_challenge_methods_supported: ["S256"],
        });
    });
    app.get("/.well-known/oauth-protected-resource", async (c) => {
        const baseUrl = gptAdapterBaseUrl();
        return c.json({
            resource: `${baseUrl}/mcp`,
            authorization_servers: [baseUrl],
            bearer_methods_supported: ["header"],
        });
    });

    // ── Authorization endpoint ────────────────────────────────────────────
    app.get("/gpt/oauth/authorize", async (c) => {
        const redirectUri = asString(c.req.query("redirect_uri"));
        const state = asString(c.req.query("state")) ?? "";
        if (!redirectUri) {
            return c.json({ error: "redirect_uri is required" }, 400);
        }

        // Validate redirect_uri against the configured allowlist (origin check).
        const allowed = GPT_OAUTH_ALLOWED_REDIRECT_URIS.some((origin) =>
            redirectUri.startsWith(origin)
        );
        if (!allowed) {
            return c.json({ error: "redirect_uri is not in the allowed origins" }, 400);
        }

        // Generate a cryptographically random auth code with a 5-minute TTL.
        const code = crypto.randomUUID();
        authCodes.set(code, {
            redirectUri,
            expiresAt: Date.now() + AUTH_CODE_TTL_MS,
            used: false,
        });

        const separator = redirectUri.includes("?") ? "&" : "?";
        return c.redirect(`${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    });

    // ── Token endpoint ────────────────────────────────────────────────────
    app.post("/gpt/oauth/token", async (c) => {
        const body = await readJsonBody(c);
        const contentType = c.req.header("content-type") ?? "";
        let clientId = asString(body.client_id);
        let clientSecret = asString(body.client_secret);
        let code = asString(body.code);
        let redirectUri = asString(body.redirect_uri);
        if (!clientId && contentType.includes("application/x-www-form-urlencoded")) {
            try {
                const text = await c.req.text();
                const params = new URLSearchParams(text);
                clientId = params.get("client_id") ?? undefined;
                clientSecret = params.get("client_secret") ?? undefined;
                code = code || params.get("code") || undefined;
                redirectUri = redirectUri || params.get("redirect_uri") || undefined;
            }
            catch (_e) {
                // Ignore malformed form bodies.
            }
        }

        // REQUIRE both client_id and client_secret.
        if (!clientId || !clientSecret) {
            return c.json({ error: "invalid_client", error_description: "client_id and client_secret are required" }, 401);
        }
        if (clientId !== GPT_OAUTH_CLIENT_ID) {
            return c.json({ error: "invalid_client" }, 401);
        }
        if (clientSecret !== GPT_OAUTH_CLIENT_SECRET) {
            return c.json({ error: "invalid_client" }, 401);
        }

        // Validate the authorization code.
        if (!code) {
            return c.json({ error: "invalid_grant", error_description: "code is required" }, 400);
        }
        const codeEntry = authCodes.get(code);
        if (!codeEntry) {
            return c.json({ error: "invalid_grant", error_description: "unknown or expired code" }, 400);
        }
        if (Date.now() >= codeEntry.expiresAt) {
            authCodes.delete(code);
            return c.json({ error: "invalid_grant", error_description: "code has expired" }, 400);
        }
        if (codeEntry.used) {
            // Code replay detected — revoke it entirely.
            authCodes.delete(code);
            return c.json({ error: "invalid_grant", error_description: "code has already been used" }, 400);
        }
        if (redirectUri && codeEntry.redirectUri !== redirectUri) {
            return c.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
        }

        // Mark the code as used.
        codeEntry.used = true;

        // Generate a short-lived opaque access token (24h TTL).
        const accessToken = crypto.randomUUID();
        activeTokens.set(accessToken, {
            expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
        });

        return c.json({
            access_token: accessToken,
            token_type: "bearer",
            expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        });
    });
}
//# sourceMappingURL=gpt-adapter-oauth-routes.js.map