import { asString, readJsonBody } from "@maple/common";
import { hashPassword, verifyPassword } from "@maple/security";
import { findRequestSession } from "../auth-session.js";

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

export function registerUserRoutes(app, options) {
  const database = options.database;

  app.get("/api/business/user/profile", async (c) => {
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
  });

  app.post("/api/business/user/change-password", async (c) => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (!session) {
      return c.json({ error: "Authentication required." }, 401);
    }

    const body = await readJsonBody(c);
    const currentPassword = asString(body.currentPassword);
    const newPassword = asString(body.newPassword);
    if (!currentPassword || !newPassword) {
      return c.json(
        { error: "currentPassword and newPassword are required." },
        400
      );
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
