import { server, database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";

function normalizeAssignment(body = {}) {
    if (body && typeof body === "object" && body.agentId) {
        return { type: "agent", agentId: asString(body.agentId) };
    }
    if (body && typeof body === "object" && body.orchestrationId) {
        return { type: "orchestration", orchestrationId: asString(body.orchestrationId) };
    }
    return {};
}

function sanitizeSchedule(raw = {}) {
    const intervalMinutes = Math.max(1, Number(raw.intervalMinutes ?? 60));
    const maxRepeats = Math.max(1, Number(raw.maxRepeats ?? 1));
    return {
        startAt: asString(raw.startAt) ?? new Date().toISOString(),
        endAt: asString(raw.endAt) ?? null,
        timezone: asString(raw.timezone) ?? "UTC",
        intervalMinutes,
        maxRepeats,
    };
}

export function registerTaskRoutes() {
    // GET /api/tasks — list scheduled tasks
    server.get("/api/tasks", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const items = await database.listTasks();
        return c.json({ ok: true, items });
    });

    // POST /api/tasks — create scheduled task
    server.post("/api/tasks", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const body = await readJsonBody(c);
        const title = asString(body?.title);
        if (!title) return c.json({ ok: false, error: "title is required" }, 400);

        const authContext = authContextStorage.getStore();
        const created = await database.createTask({
            title,
            prompt: asString(body?.prompt) ?? "",
            schedule: sanitizeSchedule(body?.schedule ?? {}),
            assignment: normalizeAssignment(body?.assignment ?? {}),
            status: "queued",
            createdBy: authContext?.userId ?? null,
        });
        return c.json({ ok: true, task: created }, 201);
    });

    // PATCH /api/tasks/:taskId — update task content/schedule
    server.patch("/api/tasks/:taskId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const body = await readJsonBody(c);
        const updates = {};
        if (body?.title !== undefined) updates.title = asString(body.title) ?? "";
        if (body?.prompt !== undefined) updates.prompt = asString(body.prompt) ?? "";
        if (body?.schedule !== undefined) updates.schedule = sanitizeSchedule(body.schedule ?? {});
        if (body?.status !== undefined) updates.status = asString(body.status) ?? "queued";

        const updated = await database.updateTask(taskId, updates);
        if (!updated) return c.json({ ok: false, error: "Task not found" }, 404);
        return c.json({ ok: true, task: updated });
    });

    // DELETE /api/tasks/:taskId — delete task
    server.delete("/api/tasks/:taskId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const existing = await database.findTaskById(taskId);
        if (!existing) return c.json({ ok: false, error: "Task not found" }, 404);
        await database.deleteTask(taskId);
        return c.json({ ok: true, deleted: true, taskId });
    });

    // POST /api/tasks/:taskId/assign — assign to agent/orchestration
    server.post("/api/tasks/:taskId/assign", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const body = await readJsonBody(c);
        const assignment = normalizeAssignment(body);
        if (!assignment.type) return c.json({ ok: false, error: "agentId or orchestrationId is required" }, 400);

        const updated = await database.assignTask(taskId, assignment);
        if (!updated) return c.json({ ok: false, error: "Task not found" }, 404);
        return c.json({ ok: true, task: updated });
    });

    // POST /api/tasks/:taskId/pause — pause task
    server.post("/api/tasks/:taskId/pause", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const updated = await database.pauseTask(taskId);
        if (!updated) return c.json({ ok: false, error: "Task not found" }, 404);
        return c.json({ ok: true, task: updated });
    });

    // POST /api/tasks/:taskId/resume — resume task
    server.post("/api/tasks/:taskId/resume", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const updated = await database.resumeTask(taskId);
        if (!updated) return c.json({ ok: false, error: "Task not found" }, 404);
        return c.json({ ok: true, task: updated });
    });

    // POST /api/tasks/:taskId/run-now — trigger immediate run
    server.post("/api/tasks/:taskId/run-now", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const taskId = c.req.param("taskId");
        const updated = await database.runTaskNow(taskId);
        if (!updated) return c.json({ ok: false, error: "Task not found" }, 404);
        return c.json({ ok: true, task: updated });
    });
}

registerTaskRoutes();
