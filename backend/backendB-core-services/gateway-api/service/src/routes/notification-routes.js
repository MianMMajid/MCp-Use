import { database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { mapleLog } from "../logging.js";

export function registerNotificationRoutes(app) {
    // GET /api/notifications — list notifications (paginated, unread first)
    app.get("/api/notifications", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = authContextStorage.getStore();
        const userId = authContext?.userId ?? "anonymous";
        const limit = c.req.query("limit");
        const offset = c.req.query("offset");

        try {
            const items = await database.listNotifications(userId, {
                limit: limit ? Number(limit) : undefined,
                offset: offset ? Number(offset) : undefined,
            });
            return c.json({ items });
        } catch (err) {
            mapleLog("error", "notifications.list_failed", { userId, error: err.message });
            return c.json({ error: "Failed to list notifications", details: err.message }, 500);
        }
    });

    // POST /api/notifications/:id/read — mark as read
    app.post("/api/notifications/:id/read", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const notificationId = c.req.param("id");
        try {
            await database.markNotificationRead(notificationId);
            return c.json({ ok: true });
        } catch (err) {
            mapleLog("error", "notifications.mark_read_failed", { notificationId, error: err.message });
            return c.json({ error: "Failed to mark notification as read", details: err.message }, 500);
        }
    });

    // POST /api/notifications/read-all — mark all as read
    app.post("/api/notifications/read-all", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = authContextStorage.getStore();
        const userId = authContext?.userId ?? "anonymous";

        try {
            await database.markAllNotificationsRead(userId);
            return c.json({ ok: true });
        } catch (err) {
            mapleLog("error", "notifications.mark_all_read_failed", { userId, error: err.message });
            return c.json({ error: "Failed to mark all as read", details: err.message }, 500);
        }
    });

    // GET /api/notifications/unread-count — count for bell badge
    app.get("/api/notifications/unread-count", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = authContextStorage.getStore();
        const userId = authContext?.userId ?? "anonymous";

        try {
            const count = await database.countUnreadNotifications(userId);
            return c.json({ count });
        } catch (err) {
            mapleLog("error", "notifications.unread_count_failed", { userId, error: err.message });
            return c.json({ error: "Failed to count unread", details: err.message }, 500);
        }
    });
}
