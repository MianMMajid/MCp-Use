import crypto, { createHmac } from "node:crypto";
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

/** Auth code store: code -> { redirectUri, expiresAt, used, codeChallenge } */
const authCodes = new Map();

/** Revoked token store: token -> true (bounded, for revocation only) */
const revokedTokens = new Map();

// HMAC secret for self-validating tokens (no shared store needed)
const TOKEN_HMAC_SECRET = process.env.MAPLE_GPT_OAUTH_TOKEN_SECRET || GPT_OAUTH_CLIENT_SECRET || "maple-gpt-oauth-default-key";

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 1000;         // 1 minute

// ---------------------------------------------------------------------------
// Periodic cleanup of expired codes and revoked tokens.
// ---------------------------------------------------------------------------
setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of authCodes) {
        if (now >= entry.expiresAt) {
            authCodes.delete(code);
        }
    }
    // Revoked tokens can be pruned after their original expiry
    for (const [token, entry] of revokedTokens) {
        if (now >= entry.expiresAt) {
            revokedTokens.delete(token);
        }
    }
}, CLEANUP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// HMAC-signed self-validating token helpers (Fix 3: no shared store needed)
// ---------------------------------------------------------------------------
function base64url(buffer) {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createSignedAccessToken(clientId) {
    const exp = Date.now() + ACCESS_TOKEN_TTL_MS;
    const payload = JSON.stringify({ sub: clientId, exp, jti: crypto.randomUUID() });
    const payloadB64 = base64url(Buffer.from(payload));
    const sig = base64url(createHmac("sha256", TOKEN_HMAC_SECRET).update(payloadB64).digest());
    return `${payloadB64}.${sig}`;
}

function parseSignedAccessToken(token) {
    if (!token || !token.includes(".")) return null;
    const [payloadB64, sig] = token.split(".", 2);
    const expectedSig = base64url(createHmac("sha256", TOKEN_HMAC_SECRET).update(payloadB64).digest());
    if (sig !== expectedSig) return null;
    try {
        const decoded = JSON.parse(Buffer.from(payloadB64, "base64").toString());
        if (!decoded.exp || Date.now() >= decoded.exp) return null;
        return decoded;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Public helper: verify a GPT access token (used by the tool dispatch route).
// ---------------------------------------------------------------------------
export function verifyGptAccessToken(token) {
    if (!token) return false;
    // Check revocation list first
    if (revokedTokens.has(token)) return false;
    // Verify HMAC-signed self-validating token
    const payload = parseSignedAccessToken(token);
    return payload !== null;
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

        // Fix 1: Parse redirect_uri as URL and compare origin exactly (immune to prefix attacks).
        let parsedRedirect;
        try { parsedRedirect = new URL(redirectUri); } catch { return c.json({ error: "Invalid redirect_uri" }, 400); }
        const redirectOrigin = parsedRedirect.origin;
        const allowed = GPT_OAUTH_ALLOWED_REDIRECT_URIS.some((origin) => redirectOrigin === origin);
        if (!allowed) {
            return c.json({ error: "redirect_uri is not in the allowed origins" }, 400);
        }

        // Fix 2: Accept PKCE code_challenge
        const codeChallenge = asString(c.req.query("code_challenge")) ?? "";
        const codeChallengeMethod = asString(c.req.query("code_challenge_method")) ?? "";
        if (codeChallengeMethod && codeChallengeMethod !== "S256") {
            return c.json({ error: "Only S256 code_challenge_method is supported" }, 400);
        }

        // Generate a cryptographically random auth code with a 5-minute TTL.
        const code = crypto.randomUUID();
        authCodes.set(code, {
            redirectUri,
            expiresAt: Date.now() + AUTH_CODE_TTL_MS,
            used: false,
            codeChallenge: codeChallenge || undefined,
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
        let codeVerifier = asString(body.code_verifier);
        if (!clientId && contentType.includes("application/x-www-form-urlencoded")) {
            try {
                const text = await c.req.text();
                const params = new URLSearchParams(text);
                clientId = params.get("client_id") ?? undefined;
                clientSecret = params.get("client_secret") ?? undefined;
                code = code || params.get("code") || undefined;
                redirectUri = redirectUri || params.get("redirect_uri") || undefined;
                codeVerifier = codeVerifier || params.get("code_verifier") || undefined;
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

        // Fix 2: PKCE S256 verification
        if (codeEntry.codeChallenge) {
            // Code was issued with a challenge — verifier is required
            if (!codeVerifier) {
                return c.json({ error: "invalid_grant", error_description: "code_verifier is required when code_challenge was provided" }, 400);
            }
            const computedChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
            if (computedChallenge !== codeEntry.codeChallenge) {
                authCodes.delete(code);
                return c.json({ error: "invalid_grant", error_description: "code_verifier does not match code_challenge" }, 400);
            }
        }

        // Mark the code as used.
        codeEntry.used = true;

        // Fix 3: Generate HMAC-signed self-validating access token (no shared store needed).
        const accessToken = createSignedAccessToken(clientId);

        return c.json({
            access_token: accessToken,
            token_type: "bearer",
            expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        });
    });
}
//# sourceMappingURL=gpt-adapter-oauth-routes.js.map