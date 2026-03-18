import { database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { runOpenClawTurn, runOpenClawLongform, listSessionsForAgent } from "../core/openclaw-agent-runtime.js";
import { runNativeAgentTurn, agentRequiresNativeRuntime } from "../core/native-agent-runtime.js";
import { runSecureChatTurn } from "../core/secure-chat-runtime.js";

function resolveOpenClawTargetFromAgent(agent) {
    const config = agent && typeof agent.config === "object" ? agent.config : {};
    return (
        asString(config.openclawAgentId) ??
        asString(config.targetAgentId) ??
        asString(config.runtimeAgentId) ??
        asString(config.agentId) ??
        null
    );
}

export function registerAgentManagementRoutes(app) {
    // POST /api/agents — create agent definition
    app.post("/api/agents", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const body = await readJsonBody(c);
        const name = asString(body.name);
        if (!name) {
            return c.json({ error: "name is required" }, 400);
        }

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        // Always use auth context userId as owner — never accept arbitrary ownerId from body
        const ownerId = authContext?.userId ?? null;

        try {
            const agent = await database.createAgent({
                name,
                description: asString(body.description) ?? "",
                ownerId,
                riskTier: asString(body.riskTier) ?? "medium",
                status: asString(body.status) ?? "active",
                capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
                tags: Array.isArray(body.tags) ? body.tags : [],
                config: body.config && typeof body.config === "object" ? body.config : {},
                pinned: body.pinned === true,
            });
            mapleLog("info", "agent.created", { agentId: agent.id, name: agent.name });
            return c.json(agent, 201);
        } catch (err) {
            mapleLog("error", "agent.create_failed", { error: err.message });
            return c.json({ error: "Failed to create agent", details: err.message }, 500);
        }
    });

    // GET /api/agents — list agents with filters
    app.get("/api/agents", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const filters = {};
        const status = c.req.query("status");
        const riskTier = c.req.query("riskTier");
        const pinned = c.req.query("pinned");
        const limit = c.req.query("limit");
        const offset = c.req.query("offset");

        // Enforce ownership scoping — users can only see their own agents
        if (authContext?.userId) filters.ownerId = authContext.userId;
        if (status) filters.status = status;
        if (riskTier) filters.riskTier = riskTier;
        if (pinned === "true") filters.pinned = true;
        if (pinned === "false") filters.pinned = false;
        if (limit) filters.limit = Number(limit);
        if (offset) filters.offset = Number(offset);

        try {
            const agents = await database.listAgents(filters);
            return c.json({ items: agents });
        } catch (err) {
            mapleLog("error", "agent.list_failed", { error: err.message });
            return c.json({ error: "Failed to list agents", details: err.message }, 500);
        }
    });

    // GET /api/agents/:agentId — get agent details
    app.get("/api/agents/:agentId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const agentId = c.req.param("agentId");
        try {
            const agent = await database.findAgentById(agentId);
            if (!agent || (authContext?.userId && agent.ownerId && agent.ownerId !== authContext.userId)) {
                return c.json({ error: "Agent not found" }, 404);
            }
            return c.json(agent);
        } catch (err) {
            mapleLog("error", "agent.get_failed", { agentId, error: err.message });
            return c.json({ error: "Failed to get agent", details: err.message }, 500);
        }
    });

    // PATCH /api/agents/:agentId — update agent (ownership enforced)
    app.patch("/api/agents/:agentId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const agentId = c.req.param("agentId");
        // Verify ownership before allowing update
        const existing = await database.findAgentById(agentId);
        if (!existing || (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
            return c.json({ error: "Agent not found" }, 404);
        }
        if (existing.status === "archived") {
            return c.json({ error: "Cannot modify an archived agent. Restore it first." }, 400);
        }
        const body = await readJsonBody(c);

        const updates = {};
        if (body.name !== undefined) updates.name = asString(body.name);
        if (body.description !== undefined) updates.description = asString(body.description);
        if (body.riskTier !== undefined) updates.riskTier = asString(body.riskTier);
        if (body.status !== undefined) updates.status = asString(body.status);
        if (body.capabilities !== undefined) updates.capabilities = body.capabilities;
        if (body.tags !== undefined) updates.tags = body.tags;
        if (body.config !== undefined) updates.config = body.config;
        if (body.pinned !== undefined) updates.pinned = body.pinned === true;

        try {
            const agent = await database.updateAgent(agentId, updates);
            if (!agent) {
                return c.json({ error: "Agent not found" }, 404);
            }
            mapleLog("info", "agent.updated", { agentId, updates: Object.keys(updates) });
            return c.json(agent);
        } catch (err) {
            mapleLog("error", "agent.update_failed", { agentId, error: err.message });
            return c.json({ error: "Failed to update agent", details: err.message }, 500);
        }
    });

    // DELETE /api/agents/:agentId — archive agent (ownership enforced)
    app.delete("/api/agents/:agentId", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const agentId = c.req.param("agentId");
        try {
            const existing = await database.findAgentById(agentId);
            if (!existing || (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
                return c.json({ error: "Agent not found" }, 404);
            }
            const agent = await database.archiveAgent(agentId);
            if (!agent) {
                return c.json({ error: "Agent not found" }, 404);
            }
            mapleLog("info", "agent.archived", { agentId });
            return c.json({ archived: true, agent });
        } catch (err) {
            mapleLog("error", "agent.archive_failed", { agentId, error: err.message });
            return c.json({ error: "Failed to archive agent", details: err.message }, 500);
        }
    });

    // POST /api/agents/:agentId/restore — restore archived agent
    app.post("/api/agents/:agentId/restore", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const agentId = c.req.param("agentId");
        try {
            const existing = await database.findAgentById(agentId);
            if (!existing || existing.status !== "archived" ||
                (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
                return c.json({ error: "Archived agent not found" }, 404);
            }
            const agent = await database.restoreAgent(agentId);
            mapleLog("info", "agent.restored", { agentId });
            return c.json({ restored: true, agent });
        } catch (err) {
            mapleLog("error", "agent.restore_failed", { agentId, error: err.message });
            return c.json({ error: "Failed to restore agent", details: err.message }, 500);
        }
    });

    // DELETE /api/agents/:agentId/permanent — permanently delete archived agent
    app.delete("/api/agents/:agentId/permanent", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
        const agentId = c.req.param("agentId");
        try {
            const existing = await database.findAgentById(agentId);
            if (!existing || existing.status !== "archived" ||
                (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
                return c.json({ error: "Archived agent not found" }, 404);
            }
            const agent = await database.permanentlyDeleteAgent(agentId);
            if (!agent) {
                return c.json({ error: "Agent not found" }, 404);
            }
            mapleLog("info", "agent.permanently_deleted", { agentId });
            return c.json({ deleted: true, agent });
        } catch (err) {
            mapleLog("error", "agent.permanent_delete_failed", { agentId, error: err.message });
            return c.json({ error: "Failed to permanently delete agent", details: err.message }, 500);
        }
    });

    // POST /api/agents/:agentId/run — start a run for this agent
    app.post("/api/agents/:agentId/run", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const agentId = c.req.param("agentId");
        const agent = await database.findAgentById(agentId);
        if (!agent) {
            return c.json({ error: "Agent not found" }, 404);
        }
        if (agent.status !== "active") {
            return c.json({ error: "Agent is not active" }, 400);
        }

        const body = await readJsonBody(c);
        const prompt = asString(body.prompt) ?? "";
        const message = asString(body.message) ?? prompt;
        const objective = asString(body.objective) ?? "";
        const mode = asString(body.mode) ?? "turn";
        const targetAgentId = resolveOpenClawTargetFromAgent(agent);

        if (!message && !objective) {
            return c.json({ error: "message (for turn) or objective (for longform) is required" }, 400);
        }

        const parentRunId = asString(body.parentRunId) ?? null;

        try {
            let result;

            // Use secure chat runtime (policy + native execution) or OpenClaw
            if (agentRequiresNativeRuntime(agent)) {
                result = await runSecureChatTurn({
                    message: message || objective,
                    sessionId: body.sessionId || `agent-${agentId}`,
                    agentId,
                    agent,
                });
            } else if (mode === "longform" && objective) {
                result = await runOpenClawLongform({
                    objective,
                    sessionId: body.sessionId,
                    agentId,
                    targetAgentId,
                    maxTurns: body.maxTurns,
                    parentRunId,
                });
            } else {
                result = await runOpenClawTurn({
                    message: message || objective,
                    sessionId: body.sessionId,
                    agentId,
                    targetAgentId,
                    parentRunId,
                });
            }
            return c.json({ ...result, agentId });
        } catch (err) {
            mapleLog("error", "agent.run_failed", { agentId, error: err.message });
            return c.json({ error: "Agent run failed", details: err.message }, 500);
        }
    });

    // GET /api/agents/:agentId/sessions — list sessions for this agent
    app.get("/api/agents/:agentId/sessions", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const agentId = c.req.param("agentId");
        const agent = await database.findAgentById(agentId);
        if (!agent) {
            return c.json({ error: "Agent not found" }, 404);
        }

        const sessions = await listSessionsForAgent(agentId);
        return c.json({ ok: true, items: sessions, agentId });
    });
}
