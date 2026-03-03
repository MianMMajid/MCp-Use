import { database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";

export function registerOrchestrationRoutes(app) {
    // POST /api/orchestrations — create orchestration
    app.post("/api/orchestrations", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const body = await readJsonBody(c);
        const authContext = authContextStorage.getStore();
        const ownerId = asString(body.ownerId) ?? authContext?.userId ?? null;

        try {
            const orchestration = await database.createOrchestration({
                name: asString(body.name) ?? "Untitled Orchestration",
                description: asString(body.description) ?? "",
                ownerId,
            });
            mapleLog("info", "orchestration.created", { orchestrationId: orchestration.id, name: orchestration.name });
            return c.json(orchestration, 201);
        } catch (err) {
            mapleLog("error", "orchestration.create_failed", { error: err.message });
            return c.json({ error: "Failed to create orchestration", details: err.message }, 500);
        }
    });

    // GET /api/orchestrations — list orchestrations with filters
    app.get("/api/orchestrations", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const filters = {};
        const ownerId = c.req.query("ownerId");
        const status = c.req.query("status");
        const limit = c.req.query("limit");
        const offset = c.req.query("offset");

        if (ownerId) filters.ownerId = ownerId;
        if (status) filters.status = status;
        if (limit) filters.limit = Number(limit);
        if (offset) filters.offset = Number(offset);

        try {
            const orchestrations = await database.listOrchestrations(filters);
            return c.json({ items: orchestrations });
        } catch (err) {
            mapleLog("error", "orchestration.list_failed", { error: err.message });
            return c.json({ error: "Failed to list orchestrations", details: err.message }, 500);
        }
    });

    // GET /api/orchestrations/:id — get single orchestration
    app.get("/api/orchestrations/:id", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const id = c.req.param("id");
        try {
            const orchestration = await database.findOrchestrationById(id);
            if (!orchestration) {
                return c.json({ error: "Orchestration not found" }, 404);
            }
            return c.json(orchestration);
        } catch (err) {
            mapleLog("error", "orchestration.get_failed", { id, error: err.message });
            return c.json({ error: "Failed to get orchestration", details: err.message }, 500);
        }
    });

    // PATCH /api/orchestrations/:id — update orchestration
    app.patch("/api/orchestrations/:id", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const id = c.req.param("id");
        const body = await readJsonBody(c);

        const updates = {};
        if (body.name !== undefined) updates.name = asString(body.name);
        if (body.description !== undefined) updates.description = asString(body.description);
        if (body.status !== undefined) updates.status = asString(body.status);
        if (body.nodes !== undefined) updates.nodes = body.nodes;
        if (body.edges !== undefined) updates.edges = body.edges;

        try {
            const orchestration = await database.updateOrchestration(id, updates);
            if (!orchestration) {
                return c.json({ error: "Orchestration not found" }, 404);
            }
            mapleLog("info", "orchestration.updated", { id, updates: Object.keys(updates) });
            return c.json(orchestration);
        } catch (err) {
            mapleLog("error", "orchestration.update_failed", { id, error: err.message });
            return c.json({ error: "Failed to update orchestration", details: err.message }, 500);
        }
    });

    // DELETE /api/orchestrations/:id — archive orchestration (soft delete)
    app.delete("/api/orchestrations/:id", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const id = c.req.param("id");
        try {
            const orchestration = await database.archiveOrchestration(id);
            if (!orchestration) {
                return c.json({ error: "Orchestration not found" }, 404);
            }
            mapleLog("info", "orchestration.archived", { id });
            return c.json({ archived: true, orchestration });
        } catch (err) {
            mapleLog("error", "orchestration.archive_failed", { id, error: err.message });
            return c.json({ error: "Failed to archive orchestration", details: err.message }, 500);
        }
    });
}
