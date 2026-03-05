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

    // GET /api/notifications/preferences — fetch notification preferences
    app.get("/api/notifications/preferences", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = authContextStorage.getStore();
        const userId = authContext?.userId ?? "anonymous";

        const defaults = {
            categories: { approvals: true, escalations: true, run_failures: true, system_alerts: true },
            channels: { email: true, in_app: true },
        };

        try {
            await database.pool.query(
                `CREATE TABLE IF NOT EXISTS notification_preferences (
                   user_id TEXT PRIMARY KEY,
                   categories_json TEXT NOT NULL DEFAULT '{}',
                   channels_json TEXT NOT NULL DEFAULT '{}',
                   updated_at TEXT NOT NULL
                 )`
            );
            const result = await database.pool.query(
                `SELECT categories_json, channels_json, updated_at FROM notification_preferences WHERE user_id = $1 LIMIT 1`,
                [userId],
            );
            if (result.rows.length === 0) {
                return c.json({ ok: true, userId, ...defaults });
            }
            const row = result.rows[0];
            const categories = { ...defaults.categories, ...JSON.parse(row.categories_json || "{}") };
            const channels = { ...defaults.channels, ...JSON.parse(row.channels_json || "{}") };
            return c.json({ ok: true, userId, categories, channels, updatedAt: row.updated_at });
        } catch (err) {
            mapleLog("error", "notifications.preferences_get_failed", { userId, error: err.message });
            return c.json({ error: "Failed to get notification preferences", details: err.message }, 500);
        }
    });

    // POST /api/notifications/preferences — upsert notification preferences
    app.post("/api/notifications/preferences", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = authContextStorage.getStore();
        const userId = authContext?.userId ?? "anonymous";
        const body = await c.req.json().catch(() => ({}));

        const defaults = {
            categories: { approvals: true, escalations: true, run_failures: true, system_alerts: true },
            channels: { email: true, in_app: true },
        };

        try {
            await database.pool.query(
                `CREATE TABLE IF NOT EXISTS notification_preferences (
                   user_id TEXT PRIMARY KEY,
                   categories_json TEXT NOT NULL DEFAULT '{}',
                   channels_json TEXT NOT NULL DEFAULT '{}',
                   updated_at TEXT NOT NULL
                 )`
            );

            const existing = await database.pool.query(
                `SELECT categories_json, channels_json FROM notification_preferences WHERE user_id = $1 LIMIT 1`,
                [userId],
            );
            const prevCategories = existing.rows.length > 0
                ? { ...defaults.categories, ...JSON.parse(existing.rows[0].categories_json || "{}") }
                : { ...defaults.categories };
            const prevChannels = existing.rows.length > 0
                ? { ...defaults.channels, ...JSON.parse(existing.rows[0].channels_json || "{}") }
                : { ...defaults.channels };

            const categories = body.categories ? { ...prevCategories, ...body.categories } : prevCategories;
            const channels = body.channels ? { ...prevChannels, ...body.channels } : prevChannels;
            const now = new Date().toISOString();

            await database.pool.query(
                `INSERT INTO notification_preferences (user_id, categories_json, channels_json, updated_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id) DO UPDATE
                 SET categories_json = EXCLUDED.categories_json,
                     channels_json = EXCLUDED.channels_json,
                     updated_at = EXCLUDED.updated_at`,
                [userId, JSON.stringify(categories), JSON.stringify(channels), now],
            );

            return c.json({ ok: true, userId, categories, channels, updatedAt: now });
        } catch (err) {
            mapleLog("error", "notifications.preferences_upsert_failed", { userId, error: err.message });
            return c.json({ error: "Failed to save notification preferences", details: err.message }, 500);
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
