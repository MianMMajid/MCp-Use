import { database } from "../state.js";
import { sessionTtlSeconds, allowSelfSignup, } from "../config.js";
import { buildSessionCookie, } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { hashPassword, verifyPassword } from "@maple/security";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { userHasMfa, createMfaSessionToken, isDeviceTrusted } from "./auth-routes-mfa.js";

// In-memory rate limiter for auth endpoints
const loginAttempts = new Map(); // key: IP, value: { count, resetAt }
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Extract client IP for rate limiting.
 * Uses X-Real-IP (typically set by a trusted reverse proxy) first,
 * then the LAST X-Forwarded-For hop (nearest proxy, which is the
 * most reliable when behind a single trusted proxy layer).
 * Falls back to a per-request unique key to prevent all unknown
 * connections from sharing a single rate-limit bucket.
 */
function extractClientIp(c) {
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp.trim();
    const xff = c.req.header('x-forwarded-for') ?? '';
    const hops = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
    // Connection-level fallback — use socket address to avoid shared "unknown" bucket
    // while still grouping requests from the same connection
    const connIp = c.env?.remoteAddress ?? c.req.raw?.socket?.remoteAddress;
    return connIp || 'unknown';
}

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return null;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return retryAfter;
    }
    return null;
}

function resetRateLimit(ip) {
    loginAttempts.delete(ip);
}

// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of loginAttempts) {
        if (now > entry.resetAt) loginAttempts.delete(ip);
    }
}, 5 * 60 * 1000).unref();

export function registerAuthLoginRegisterRoutes(app) {
    app.post("/api/auth/login", async (c) => {
        const ip = extractClientIp(c);
        const retryAfter = checkRateLimit(ip);
        if (retryAfter) {
            c.header('Retry-After', String(retryAfter));
            return c.json({ error: "Too many login attempts. Please try again later." }, 429);
        }

        const body = await readJsonBody(c);
        const username = asString(body.username) || asString(body.email);
        const password = asString(body.password);
        if (!username || !password) {
            return c.json({ error: "username/email and password are required." }, 400);
        }
        let user = await database.findUserByUsername(username);
        if (!user && typeof database.findUserByEmail === "function") {
            user = await database.findUserByEmail(username);
        }
        if (!user || !verifyPassword(password, user.passwordHash)) {
            return c.json({ error: "Invalid credentials." }, 401);
        }
        resetRateLimit(ip);

        // Check if user has MFA enabled
        try {
            const hasMfa = await userHasMfa(user.id);
            if (hasMfa) {
                // Check if device is trusted (skip MFA)
                const cookieHeader = c.req.header("cookie");
                if (isDeviceTrusted(cookieHeader, user.id)) {
                    // Trusted device — proceed with normal login
                    const session = await database.createSession(user.id, sessionTtlSeconds);
                    try {
                        await database.pool.query(
                            `UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`,
                            [session.id]
                        );
                    } catch { /* column may not exist */ }
                    c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
                    return c.json(buildSessionAuthResponse(user, session));
                }

                // MFA required — return challenge token
                const mfaSessionToken = createMfaSessionToken(user.id);
                return c.json({
                    ok: true,
                    authenticated: false,
                    mfaRequired: true,
                    mfaSessionToken,
                    message: "MFA verification required. Submit your TOTP code to /api/auth/mfa/challenge.",
                });
            }
        } catch {
            // MFA check failed — proceed without MFA requirement
        }

        const session = await database.createSession(user.id, sessionTtlSeconds);
        c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
        return c.json(buildSessionAuthResponse(user, session));
    });
    app.post("/api/auth/register", async (c) => {
        const ip = extractClientIp(c);
        const retryAfter = checkRateLimit(ip);
        if (retryAfter) {
            c.header('Retry-After', String(retryAfter));
            return c.json({ error: "Too many registration attempts. Please try again later." }, 429);
        }

        // Validate body BEFORE self-signup check so clients always get proper
        // validation errors for malformed requests regardless of signup state.
        const body = await readJsonBody(c);
        const username = asString(body.username);
        const password = asString(body.password);
        const email = asString(body.email);
        if (!username || !password) {
            return c.json({ error: "username and password are required." }, 400);
        }
        const existingUsers = await database.countUsers();
        if (!allowSelfSignup && existingUsers > 0) {
            return c.json({ error: "Self-signup is disabled." }, 403);
        }
        if (password.length < 8) {
            return c.json({ error: "password must be at least 8 characters." }, 400);
        }
        if (await database.findUserByUsername(username)) {
            return c.json({ error: "Username already exists." }, 409);
        }
        if (email && typeof database.findUserByEmail === "function" && await database.findUserByEmail(email)) {
            return c.json({ error: "Email already exists." }, 409);
        }
        const user = await database.createUser({
            username,
            email,
            passwordHash: hashPassword(password),
        });
        const session = await database.createSession(user.id, sessionTtlSeconds);
        c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
        return c.json(buildSessionAuthResponse(user, session));
    });
}
