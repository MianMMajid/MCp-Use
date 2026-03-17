import { database, traceStore } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog } from "../logging.js";
import { listOpenClawRuns } from "../core/openclaw-agent-runtime.js";

export function registerSearchRoutes(app) {
    // GET /api/search?q=...&types=agents,runs,tools,traces,approvals
    app.get("/api/search", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const query = (c.req.query("q") ?? "").trim();
        if (!query) {
            return c.json({ results: [] });
        }

        const typesParam = c.req.query("types") ?? "agents,runs,traces";
        const requestedTypes = new Set(typesParam.split(",").map((t) => t.trim()).filter(Boolean));
        const limit = 10;
        const results = [];

        try {
            const searches = [];

            if (requestedTypes.has("agents")) {
                searches.push(
                    database.searchAgents(query, limit).then((items) =>
                        items.map((item) => ({ type: "agent", id: item.id, title: item.name, description: item.description, data: item }))
                    ).catch(() => [])
                );
            }

            if (requestedTypes.has("runs")) {
                searches.push(
                    Promise.resolve().then(async () => {
                        const { items } = await listOpenClawRuns({ limit: 50 });
                        const q = query.toLowerCase();
                        return items
                            .filter((r) => r.runId.toLowerCase().includes(q) || r.sessionId.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))
                            .slice(0, limit)
                            .map((item) => ({ type: "run", id: item.runId, title: `Run ${item.runId.slice(0, 8)}`, description: `${item.type} — ${item.status}`, data: item }));
                    }).catch(() => [])
                );
            }

            if (requestedTypes.has("traces")) {
                searches.push(
                    Promise.resolve().then(() => {
                        const allTraces = traceStore.listAll ? traceStore.listAll() : [];
                        const q = query.toLowerCase();
                        return allTraces
                            .filter((t) => (t.id ?? "").toLowerCase().includes(q) || (t.sessionId ?? "").toLowerCase().includes(q))
                            .slice(0, limit)
                            .map((item) => ({ type: "trace", id: item.id, title: `Trace ${(item.id ?? "").slice(0, 8)}`, description: `Session: ${item.sessionId ?? "unknown"}`, data: { id: item.id, sessionId: item.sessionId, status: item.status } }));
                    }).catch(() => [])
                );
            }

            const searchResults = await Promise.all(searches);
            for (const batch of searchResults) {
                results.push(...batch);
            }

            return c.json({ query, results });
        } catch (err) {
            mapleLog("error", "search.failed", { query, error: err.message });
            return c.json({ error: "Search failed", details: err.message }, 500);
        }
    });
}
