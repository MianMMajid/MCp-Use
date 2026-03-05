import { randomUUID } from "node:crypto";
import { database } from "../state.js";
import { sessionTtlSeconds, googleClientId, } from "../config.js";
import { buildSessionCookie, verifyGoogleJwt, } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
export function registerAuthGoogleRoutes(app) {
    const resolvedGoogleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? googleClientId;
    app.get("/api/auth/google/client-id", async (c) => {
        return c.json({
            clientId: resolvedGoogleClientId,
            configured: Boolean(resolvedGoogleClientId),
        });
    });
    app.post("/api/auth/google", async (c) => {
        const body = await readJsonBody(c);
        let googleUser;
        if (!resolvedGoogleClientId) {
            return c.json({ error: "Google sign-in is unavailable." }, 503);
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
        });
    });
}
