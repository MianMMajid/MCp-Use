import { randomUUID } from "node:crypto";
import { database } from "../state.js";
import { sessionTtlSeconds, googleClientId, } from "../config.js";
import { buildSessionCookie, verifyGoogleJwt, } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { applyBusinessApiProxyHeaders, businessApiUnavailableResponse, isBusinessApiRequired, proxyBusinessApiRequest, } from "../core/business-api-client.js";
export function registerAuthGoogleRoutes(app) {
    app.get("/api/auth/google/client-id", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/google/client-id");
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.google_client_id");
        }
        return c.json({ clientId: googleClientId });
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
        if (!googleClientId) {
            return c.json({ error: "Google sign-in is not configured." }, 501);
        }
        const credential = asString(body.credential);
        if (!credential) {
            return c.json({ error: "credential is required." }, 400);
        }
        let googleUser;
        try {
            googleUser = await verifyGoogleJwt(credential);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Token verification failed";
            return c.json({ error: msg }, 401);
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
        return c.json(buildSessionAuthResponse(user, session));
    });
}
//# sourceMappingURL=auth-routes-google.js.map
