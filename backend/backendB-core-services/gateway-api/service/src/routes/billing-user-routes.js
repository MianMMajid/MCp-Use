import { database } from "../state.js";
import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { verifyPassword, hashPassword } from "@maple/security";
import { businessApiUnavailableResponse, isBusinessApiRequired, proxyBusinessApiRequest } from "../core/business-api-client.js";

function profileResponse(user, subscription) {
    return {
        ok: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
        },
        subscription: {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
        },
    };
}

async function localProfileResponse(c) {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
        return c.json({ error: "Authentication required." }, 401);
    }
    const user = await database.findUserById(session.user.id);
    if (!user) {
        return c.json({ error: "User not found." }, 404);
    }
    const subscription = await database.ensureFreeSubscription(user.id);
    return c.json(profileResponse(user, subscription));
}

async function localChangePasswordResponse(c, body) {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
        return c.json({ error: "Authentication required." }, 401);
    }
    const currentPassword = asString(body.currentPassword);
    const newPassword = asString(body.newPassword);
    if (!currentPassword || !newPassword) {
        return c.json({ error: "currentPassword and newPassword are required." }, 400);
    }
    if (newPassword.length < 8) {
        return c.json({ error: "New password must be at least 8 characters." }, 400);
    }
    const user = await database.findUserById(session.user.id);
    if (!user) {
        return c.json({ error: "User not found." }, 404);
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
        return c.json({ error: "Current password is incorrect." }, 401);
    }
    await database.updatePasswordByUserId(user.id, hashPassword(newPassword));
    return c.json({ ok: true });
}

export function registerBillingUserRoutes(app) {
    app.get("/api/user/profile", async (c) => {
        const proxied = await proxyBusinessApiRequest(c, "/api/business/user/profile");
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "user.profile");
        }
        return localProfileResponse(c);
    });
    async function handleChangePassword(c) {
        const body = await readJsonBody(c);
        const proxied = await proxyBusinessApiRequest(c, "/api/business/user/change-password", {
            method: "POST",
            body,
        });
        if (proxied.proxied) {
            return c.json(proxied.payload, proxied.status);
        }
        if (isBusinessApiRequired()) {
            return businessApiUnavailableResponse(c, proxied, "user.change_password");
        }
        return localChangePasswordResponse(c, body);
    }
    app.post("/api/user/change-password", handleChangePassword);
    // Backward-compatible alias used by frontendA settings panel.
    app.post("/api/auth/change-password", handleChangePassword);
}
//# sourceMappingURL=billing-user-routes.js.map
