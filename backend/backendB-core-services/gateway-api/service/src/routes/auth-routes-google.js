import { randomUUID } from "node:crypto";
import { database } from "../state.js";
import { sessionTtlSeconds, googleClientId, } from "../config.js";
import { buildSessionCookie, verifyGoogleJwt, } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { applyBusinessApiProxyHeaders, businessApiUnavailableResponse, isBusinessApiRequired, proxyBusinessApiRequest, } from "../core/business-api-client.js";
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
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
export function registerAuthGoogleRoutes(app) {
    const resolvedGoogleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? googleClientId;
    const isProduction = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    const googleSimulationEnabled = !resolvedGoogleClientId &&
        !isProduction &&
        parseBooleanEnv(process.env.MAPLE_GOOGLE_AUTH_SIMULATION, false);
    app.get("/api/auth/google/client-id", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/google/client-id");
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.google_client_id");
        }
        return c.json({
            clientId: resolvedGoogleClientId,
            configured: Boolean(resolvedGoogleClientId),
            simulated: googleSimulationEnabled,
        });
    });
    app.post("/api/auth/google", async (c) => {
        const body = await readJsonBody(c);
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/google", {
            method: "POST",
            body,
        });
        if (proxied.proxied) {
            applyBusinessApiProxyHeaders(c, proxied);
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.google");
        }
        let googleUser;
        if (!resolvedGoogleClientId) {
            if (!googleSimulationEnabled) {
                return c.json({ error: "Google sign-in is unavailable." }, 503);
            }
            googleUser = parseSimulatedGoogleUser(body);
            if (!googleUser) {
                return c.json({
                    error: "For simulated Google auth provide email or a credential containing an email.",
                }, 400);
            }
        }
        else {
            const credential = asString(body.credential);
            if (!credential) {
                return c.json({ error: "credential is required." }, 400);
            }
            try {
                googleUser = await verifyGoogleJwt(credential);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Token verification failed";
                return c.json({ error: msg }, 401);
            }
        }
        let user = await database.findUserByEmail(googleUser.email);
        if (!user) {
            let baseUsername = googleUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
            if (!baseUsername)
                baseUsername = "user";
            let username = baseUsername;
            while (await database.findUserByUsername(username)) {
                username = baseUsername + "_" + randomUUID().slice(0, 6);
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
//# sourceMappingURL=auth-routes-google.js.map
