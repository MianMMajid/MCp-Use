import { server, database } from "../state.js";
import {
  clearSessionCookieHeader,
  sessionCookieValue,
} from "../auth.js";

export function registerAuthLogoutRoute(app: typeof server.app) {
  app.post("/api/auth/logout", async (c) => {
    const sessionId = sessionCookieValue(c.req.header("cookie"));
    if (sessionId) {
      await database.revokeSession(sessionId);
    }
    c.header("set-cookie", clearSessionCookieHeader());
    return c.json({ ok: true });
  });
}
