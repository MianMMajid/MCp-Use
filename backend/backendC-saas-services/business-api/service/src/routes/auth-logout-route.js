import { clearSessionCookieHeader, sessionCookieValue } from "../auth-session.js";

export function registerAuthLogoutRoute(app, options) {
  const database = options.database;

  app.post("/api/business/auth/logout", async (c) => {
    const sessionId = sessionCookieValue(c.req.header("cookie"));
    if (sessionId) {
      await database.revokeSession(sessionId);
    }

    c.header("set-cookie", clearSessionCookieHeader());
    return c.json({ ok: true });
  });
}
