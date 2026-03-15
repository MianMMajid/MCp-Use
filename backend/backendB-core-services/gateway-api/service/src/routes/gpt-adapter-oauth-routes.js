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

/** Revoked token store: token -> { expiresAt } (bounded, for revocation only) */
const revokedTokens = new Map();

// HMAC secret for self-validating tokens (no shared store needed)
const TOKEN_HMAC_SECRET = process.env.MAPLE_GPT_OAUTH_TOKEN_SECRET || GPT_OAUTH_CLIENT_SECRET || "maple-gpt-oauth-default-key";

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 1000;         // 1 minute

// ---------------------------------------------------------------------------
// HMAC-signed self-validating helpers (no shared store needed cross-pod)
// ---------------------------------------------------------------------------
function base64url(buffer) {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Finding 8: HMAC-signed auth codes so they work cross-pod
function createSignedAuthCode(redirectUri, codeChallenge) {
    const exp = Date.now() + AUTH_CODE_TTL_MS;
    const jti = crypto.randomUUID();
    const payload = JSON.stringify({ redirectUri, codeChallenge: codeChallenge || undefined, exp, jti });
    const payloadB64 = base64url(Buffer.from(payload));
    const sig = base64url(createHmac("sha256", TOKEN_HMAC_SECRET).update(payloadB64).digest());
    return { code: `${payloadB64}.${sig}`, jti };
}

function parseSignedAuthCode(code) {
    if (!code || !code.includes(".")) return null;
    const [payloadB64, sig] = code.split(".", 2);
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

/**
 * Used-code set: jti -> expiresAt (bounded, prevents replay).
 *
 * LIMITATION: This is per-process. In multi-replica deployments, the same auth
 * code could theoretically be redeemed once per pod within the 5-minute TTL.
 * Mitigation: codes are HMAC-signed and short-lived, and each redemption
 * requires valid client_secret + optional PKCE, making cross-pod replay
 * require both network interception and credential theft.
 *
 * For full cross-pod replay protection, migrate to a shared store (Redis/PG).
 */
const usedCodes = new Map();

// ---------------------------------------------------------------------------
// Periodic cleanup of expired replay entries and revoked tokens.
// ---------------------------------------------------------------------------
setInterval(() => {
    const now = Date.now();
    for (const [jti, entry] of usedCodes) {
        if (now >= entry.expiresAt) {
            usedCodes.delete(jti);
        }
    }
    for (const [token, entry] of revokedTokens) {
        if (now >= entry.expiresAt) {
            revokedTokens.delete(token);
        }
    }
}, CLEANUP_INTERVAL_MS).unref();

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

        // Finding 8: Generate HMAC-signed auth code (works cross-pod, no shared store).
        const { code } = createSignedAuthCode(redirectUri, codeChallenge);

        const separator = redirectUri.includes("?") ? "&" : "?";
        return c.redirect(`${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    });

    // ── Token endpoint ────────────────────────────────────────────────────
    app.post("/gpt/oauth/token", async (c) => {
        // Finding 7: Check content-type BEFORE consuming body to avoid
        // double-read (readJsonBody consumes the stream, breaking c.req.text()).
        const contentType = c.req.header("content-type") ?? "";
        let clientId, clientSecret, code, redirectUri, codeVerifier;

        if (contentType.includes("application/x-www-form-urlencoded")) {
            try {
                const text = await c.req.text();
                const params = new URLSearchParams(text);
                clientId = params.get("client_id") ?? undefined;
                clientSecret = params.get("client_secret") ?? undefined;
                code = params.get("code") ?? undefined;
                redirectUri = params.get("redirect_uri") ?? undefined;
                codeVerifier = params.get("code_verifier") ?? undefined;
            }
            catch (_e) {
                // Ignore malformed form bodies.
            }
        } else {
            const body = await readJsonBody(c);
            clientId = asString(body.client_id);
            clientSecret = asString(body.client_secret);
            code = asString(body.code);
            redirectUri = asString(body.redirect_uri);
            codeVerifier = asString(body.code_verifier);
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

        // Validate the authorization code (Finding 8: HMAC-signed, cross-pod safe).
        if (!code) {
            return c.json({ error: "invalid_grant", error_description: "code is required" }, 400);
        }
        const codeEntry = parseSignedAuthCode(code);
        if (!codeEntry) {
            return c.json({ error: "invalid_grant", error_description: "unknown or expired code" }, 400);
        }
        // Replay protection: check used-code set (bounded by TTL cleanup)
        if (usedCodes.has(codeEntry.jti)) {
            return c.json({ error: "invalid_grant", error_description: "code has already been used" }, 400);
        }
        // RFC 6749 §4.1.3: redirect_uri MUST match when it was included in the authorization request
        if (codeEntry.redirectUri !== (redirectUri ?? "")) {
            return c.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
        }

        // PKCE S256 verification
        if (codeEntry.codeChallenge) {
            if (!codeVerifier) {
                return c.json({ error: "invalid_grant", error_description: "code_verifier is required when code_challenge was provided" }, 400);
            }
            const computedChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
            if (computedChallenge !== codeEntry.codeChallenge) {
                return c.json({ error: "invalid_grant", error_description: "code_verifier does not match code_challenge" }, 400);
            }
        }

        // Mark the code as used (replay protection).
        usedCodes.set(codeEntry.jti, { expiresAt: codeEntry.exp });

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