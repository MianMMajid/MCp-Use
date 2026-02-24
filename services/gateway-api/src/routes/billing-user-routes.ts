import { server, database } from "../state.js";
import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { verifyPassword, hashPassword } from "@maple/security";

export function registerBillingUserRoutes(app: typeof server.app) {
  app.get("/api/user/profile", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }
    const user = await database.findUserById(session.user.id);
    if (!user) {
      return c.json({ error: "User not found." }, 404);
    }
    const subscription = await database.ensureFreeSubscription(user.id);
    return c.json({
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
    });
  });

  app.post("/api/user/change-password", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }
    const body = await readJsonBody(c);
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
  });
}
