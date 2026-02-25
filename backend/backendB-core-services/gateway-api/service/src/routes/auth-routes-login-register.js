import { database } from "../state.js";
import { sessionTtlSeconds, allowSelfSignup, } from "../config.js";
import { buildSessionCookie, } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { hashPassword, verifyPassword } from "@maple/security";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import { applyBusinessApiProxyHeaders, businessApiUnavailableResponse, isBusinessApiRequired, proxyBusinessApiRequest, } from "../core/business-api-client.js";
export function registerAuthLoginRegisterRoutes(app) {
    app.post("/api/auth/login", async (c) => {
        const body = await readJsonBody(c);
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/login", {
            method: "POST",
            body,
        });
        if (proxied.proxied) {
            applyBusinessApiProxyHeaders(c, proxied);
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.login");
        }
        const username = asString(body.username);
        const password = asString(body.password);
        if (!username || !password) {
            return c.json({ error: "username and password are required." }, 400);
        }
        const user = await database.findUserByUsername(username);
        if (!user || !verifyPassword(password, user.passwordHash)) {
            return c.json({ error: "Invalid username or password." }, 401);
        }
        const session = await database.createSession(user.id, sessionTtlSeconds);
        c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
        return c.json(buildSessionAuthResponse(user, session));
    });
    app.post("/api/auth/register", async (c) => {
        const body = await readJsonBody(c);
        const proxied = await proxyBusinessApiRequest(c, "/api/business/auth/register", {
            method: "POST",
            body,
        });
        if (proxied.proxied) {
            applyBusinessApiProxyHeaders(c, proxied);
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "auth.register");
        }
        const existingUsers = await database.countUsers();
        if (!allowSelfSignup && existingUsers > 0) {
            return c.json({ error: "Self-signup is disabled." }, 403);
        }
        const username = asString(body.username);
        const password = asString(body.password);
        const email = asString(body.email);
        if (!username || !password) {
            return c.json({ error: "username and password are required." }, 400);
        }
        if (password.length < 8) {
            return c.json({ error: "password must be at least 8 characters." }, 400);
        }
        if (await database.findUserByUsername(username)) {
            return c.json({ error: "Username already exists." }, 409);
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
//# sourceMappingURL=auth-routes-login-register.js.map
