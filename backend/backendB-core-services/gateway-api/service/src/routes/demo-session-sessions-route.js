import { database } from "../state.js";
import { configuredBridgeUrl, configuredBridgeToken, } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
export function registerDemoSessionsRoute(app) {
    app.get("/api/demo/sessions", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized)
            return unauthorized;
        if (!configuredBridgeUrl || !configuredBridgeToken) {
            return c.json({ sessions: [] });
        }
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            try {
                const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
                    headers: { Authorization: `Bearer ${configuredBridgeToken}` },
                    signal: controller.signal,
                });
                if (!res.ok)
                    return c.json({ sessions: [] });
                const body = (await res.json());
                const sessions = Array.isArray(body.sessions) ? body.sessions : [];
                return c.json({ sessions });
            }
            finally {
                clearTimeout(timeout);
            }
        }
        catch {
            return c.json({ sessions: [] });
        }
    });
}
//# sourceMappingURL=demo-session-sessions-route.js.map