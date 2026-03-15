import { Pool } from "pg";
import { mapleLog } from "@maple/common";
import { config } from "./config.js";
function normalizeToolInputSchema(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    return raw;
}
export class DownstreamRegistry {
    apps = new Map();
    pool = null;
    pgReady = false;
    /**
     * Parse MAPLE_DOWNSTREAM_APPS env var (format: "id1=url1,id2=url2")
     * and register each app in the registry.
     */
    loadFromEnv() {
        const raw = config.mapleDownstreamApps;
        if (!raw || raw.trim().length === 0) {
            mapleLog("info", "downstream_load_env_skip", { reason: "MAPLE_DOWNSTREAM_APPS is empty" });
            return;
        }
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (!Array.isArray(parsed)) {
                    throw new Error("Expected JSON array");
                }
                for (const entry of parsed) {
                    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                        continue;
                    }
                    const record = entry;
                    const appId = String(record.id ?? "").trim();
                    const url = String(record.mcpUrl ?? record.url ?? "").trim();
                    if (!appId || !url) {
                        continue;
                    }
                    const name = String(record.name ?? appId).trim() || appId;
                    const enabled = record.enabled === false ? false : true;
                    const tools = Array.isArray(record.tools)
                        ? record.tools
                            .filter((tool) => tool && typeof tool === "object" && !Array.isArray(tool))
                            .map((tool) => {
                            const t = tool;
                            return {
                                name: String(t.name ?? "").trim(),
                                description: String(t.description ?? "").trim(),
                                inputSchema: normalizeToolInputSchema(t.inputSchema ?? t.input_schema ?? t.schema),
                            };
                        })
                            .filter((tool) => tool.name.length > 0)
                        : [];
                    this.register({
                        appId,
                        name,
                        url,
                        transport: "streamable-http",
                        enabled,
                        status: enabled ? "connected" : "disconnected",
                        tools,
                    });
                }
                mapleLog("info", "downstream_load_env_done", { source: "json", count: this.apps.size, appIds: [...this.apps.keys()] });
                return;
            }
            catch (err) {
                mapleLog("warn", "downstream_load_env_json_parse_failed", { error: err.message });
            }
        }
        const entries = raw.split(",").map((e) => e.trim()).filter((e) => e.length > 0);
        for (const entry of entries) {
            const eqIndex = entry.indexOf("=");
            if (eqIndex === -1) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "missing '=' separator" });
                continue;
            }
            const id = entry.slice(0, eqIndex).trim();
            const url = entry.slice(eqIndex + 1).trim();
            if (!id) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "empty app id" });
                continue;
            }
            if (!url) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "empty url" });
                continue;
            }
            this.register({
                appId: id,
                name: id,
                url,
                transport: "streamable-http",
                enabled: true,
                status: "connected",
                tools: [],
            });
        }
        mapleLog("info", "downstream_load_env_done", { source: "legacy", count: this.apps.size, appIds: [...this.apps.keys()] });
    }
    register(app) {
        if (this.apps.has(app.appId)) {
            const existing = this.apps.get(app.appId);
            mapleLog("error", "downstream_duplicate_app_id_rejected", {
                appId: app.appId,
                existingUrl: existing.url,
                duplicateUrl: app.url,
            });
            throw new Error(
                `Duplicate downstream app ID "${app.appId}" rejected. ` +
                `Existing URL: ${existing.url}, duplicate URL: ${app.url}. ` +
                `Each app must have a unique ID to prevent silent traffic hijacking.`
            );
        }
        this.apps.set(app.appId, app);
        mapleLog("info", "downstream_registered", { appId: app.appId, name: app.name, url: app.url });
    }
    get(appId) {
        return this.apps.get(appId);
    }
    list(includeDisabled = false) {
        const all = [...this.apps.values()];
        return includeDisabled ? all : all.filter((a) => a.enabled);
    }
    getToolsForApp(appId) {
        return this.apps.get(appId)?.tools ?? [];
    }
    setToolsForApp(appId, tools) {
        const app = this.apps.get(appId);
        if (!app)
            return;
        app.tools = tools
            .map((tool) => ({
            name: String(tool?.name ?? "").trim(),
            description: String(tool?.description ?? "").trim(),
            inputSchema: normalizeToolInputSchema(tool?.inputSchema),
        }))
            .filter((tool) => tool.name.length > 0);
        this.apps.set(appId, app);
    }
    getAllTools() {
        const tools = [];
        for (const app of this.apps.values()) {
            if (!app.enabled)
                continue;
            for (const tool of app.tools) {
                tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, appId: app.appId });
            }
        }
        return tools;
    }
    async initializePg(databaseUrl) {
        try {
            this.pool = new Pool({
                connectionString: databaseUrl,
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });
            const client = await this.pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS tool_registry (
                        app_id TEXT NOT NULL,
                        tool_name TEXT NOT NULL,
                        tool_schema_json TEXT DEFAULT '{}',
                        discovered_at TEXT NOT NULL,
                        PRIMARY KEY (app_id, tool_name)
                    );
                `);
                this.pgReady = true;
                mapleLog("info", "downstream_registry_pg_initialized", {});
            } finally {
                client.release();
            }
        } catch (err) {
            mapleLog("warn", "downstream_registry_pg_init_failed", { error: err.message });
            this.pgReady = false;
        }
    }
    async loadToolsFromPg() {
        if (!this.pgReady || !this.pool) return;
        try {
            const result = await this.pool.query(
                `SELECT app_id, tool_name, tool_schema_json, discovered_at FROM tool_registry`
            );
            for (const row of result.rows) {
                const app = this.apps.get(row.app_id);
                if (!app) continue;
                let schema;
                try { schema = JSON.parse(row.tool_schema_json); } catch { schema = {}; }
                const existingTool = app.tools.find((t) => t.name === row.tool_name);
                if (!existingTool) {
                    app.tools.push({ name: row.tool_name, description: "", inputSchema: normalizeToolInputSchema(schema) });
                }
            }
            mapleLog("info", "downstream_registry_pg_loaded", { toolCount: result.rows.length });
        } catch (err) {
            mapleLog("warn", "downstream_registry_pg_load_failed", { error: err.message });
        }
    }
    async persistToolsForApp(appId, tools) {
        if (!this.pgReady || !this.pool) return;
        const now = new Date().toISOString();
        try {
            for (const tool of tools) {
                if (!tool.name) continue;
                await this.pool.query(
                    `INSERT INTO tool_registry (app_id, tool_name, tool_schema_json, discovered_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (app_id, tool_name) DO UPDATE SET
                        tool_schema_json = EXCLUDED.tool_schema_json,
                        discovered_at = EXCLUDED.discovered_at`,
                    [appId, tool.name, JSON.stringify(tool.inputSchema ?? {}), now]
                );
            }
        } catch (err) {
            mapleLog("warn", "downstream_registry_pg_persist_failed", { appId, error: err.message });
        }
    }
}
//# sourceMappingURL=downstream-registry.js.map